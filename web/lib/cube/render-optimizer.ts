import {
  Box3,
  Camera,
  Frustum,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  Plane,
  Sphere,
  Vector3,
  DynamicDrawUsage,
  BufferGeometry,
  MeshBasicMaterial,
} from 'three';

interface Source {
  mesh: Mesh;
  center: Vector3;
  extent: Vector3;
  sphere: Sphere;
  active: boolean;
  visible: boolean;
}
interface Batch {
  sources: Source[];
  draw: InstancedMesh;
  previous: Source[];
}
interface Occluder {
  mesh: Mesh;
  local: Vector3[];
  world: Vector3[];
  planes: Plane[];
  center: Vector3;
  normal: Vector3;
}

/** Include every ancestor: a hidden magnet group must not remain pickable. */
export function isHierarchyVisible(object: Object3D) {
  for (let node: Object3D | null = object; node; node = node.parent)
    if (!node.visible) return false;
  return true;
}

/** Exact-geometry instancing plus conservative, whole-bounds occlusion. */
export class CubeRenderOptimizer {
  readonly group = new Group();
  private readonly main = new Group();
  private readonly shadows = new Group();
  private readonly sources: Source[] = [];
  private readonly byMesh = new Map<Mesh, Source>();
  private readonly batches: Batch[] = [];
  private readonly shadowBatches: { sources: Source[]; draw: InstancedMesh }[] =
    [];
  private readonly shadowMaterial = new MeshBasicMaterial();
  private readonly occluders: Occluder[] = [];
  private readonly frustum = new Frustum();
  private readonly projection = new Matrix4();
  private readonly box = new Box3();
  private readonly eye = new Vector3();
  private readonly behind = new Vector3();
  private readonly volumes: Occluder[] = [];

  constructor(
    mechanics: Mesh[],
    private readonly caps: Mesh[],
  ) {
    this.group.name = 'Visible mechanical instances';
    this.group.add(this.main, this.shadows);
    const grouped = new Map<string, Source[]>();
    const shadowGroups = new Map<BufferGeometry, Source[]>();
    const geometryCache = new GeometryCache();
    for (const mesh of [...mechanics, ...caps]) {
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
      const source: Source = {
        mesh,
        center: new Vector3(),
        extent: new Vector3(),
        sphere: new Sphere(),
        active: true,
        visible: true,
      };
      this.sources.push(source);
      this.byMesh.set(mesh, source);
      if (mesh.castShadow) {
        const geometry = geometryCache.get(mesh.geometry);
        const shadows = shadowGroups.get(geometry) || [];
        shadows.push(source);
        shadowGroups.set(geometry, shadows);
      }
    }
    for (const mesh of mechanics) {
      // Keep original nodes and transforms for picking and exploded assembly.
      mesh.layers.set(1);
      const material = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const key = [
        geometryCache.get(mesh.geometry).uuid,
        ...material.map((m) => m.uuid),
        mesh.castShadow,
        mesh.receiveShadow,
      ].join(':');
      const list = grouped.get(key) || [];
      list.push(this.byMesh.get(mesh)!);
      grouped.set(key, list);
    }
    for (const sources of grouped.values()) {
      const source = sources[0].mesh;
      const make = () => {
        const mesh = new InstancedMesh(
          geometryCache.get(source.geometry),
          source.material,
          sources.length,
        );
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.castShadow = source.castShadow;
        mesh.receiveShadow = source.receiveShadow;
        // Individual instance bounds are culled before submitting this batch.
        mesh.frustumCulled = false;
        return mesh;
      };
      const draw = make();
      this.main.add(draw);
      this.batches.push({ sources, draw, previous: [] });
    }
    // All cube components are opaque and cast the same depth-only silhouette.
    // Colour/photo materials do not need separate shadow submissions.
    for (const [geometry, sources] of shadowGroups) {
      const draw = new InstancedMesh(
        geometry,
        this.shadowMaterial,
        sources.length,
      );
      draw.instanceMatrix.setUsage(DynamicDrawUsage);
      draw.castShadow = true;
      draw.frustumCulled = false;
      this.shadows.add(draw);
      this.shadowBatches.push({ sources, draw });
    }
    for (const mesh of caps) {
      const points = mesh.geometry.userData.occluder as number[][];
      this.occluders.push({
        mesh,
        local: points.map(
          (p) => new Vector3(...(p as [number, number, number])),
        ),
        world: points.map(() => new Vector3()),
        planes: Array.from({ length: points.length + 1 }, () => new Plane()),
        center: new Vector3(),
        normal: new Vector3(),
      });
    }
  }

  updateBounds() {
    // Caps may still carry the preceding view's visibility flag.
    for (const cap of this.caps) cap.visible = true;
    for (const source of this.sources) {
      const { mesh } = source;
      source.active = isHierarchyVisible(mesh);
      this.box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
      this.box.getCenter(source.center);
      this.box.getSize(source.extent).multiplyScalar(0.5);
      source.sphere
        .copy(mesh.geometry.boundingSphere!)
        .applyMatrix4(mesh.matrixWorld);
    }
    for (const occluder of this.occluders) {
      occluder.center.set(0, 0, 0.019).applyMatrix4(occluder.mesh.matrixWorld);
      occluder.normal
        .set(0, 0, 1)
        .transformDirection(occluder.mesh.matrixWorld);
      occluder.world.forEach((p, i) =>
        p.copy(occluder.local[i]).applyMatrix4(occluder.mesh.matrixWorld),
      );
    }
    for (const batch of this.shadowBatches) {
      let count = 0;
      for (const source of batch.sources)
        if (source.active)
          batch.draw.setMatrixAt(count++, source.mesh.matrixWorld);
      batch.draw.count = count;
      batch.draw.instanceMatrix.needsUpdate = true;
    }
    for (const batch of this.batches) batch.previous = [];
  }

  prepareShadow() {
    // Camera-hidden parts can still cast visible shadows. Use a separate full
    // instance buffer for the light pass; view culling never truncates it.
    this.main.visible = false;
    this.shadows.visible = true;
    for (const cap of this.caps) cap.visible = false;
  }

  restoreCamera() {
    this.main.visible = true;
    this.shadows.visible = false;
    for (const cap of this.caps) cap.visible = this.byMesh.get(cap)!.visible;
  }

  prepareCamera(camera: Camera) {
    this.main.visible = true;
    this.shadows.visible = false;
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    this.frustum.setFromProjectionMatrix(
      this.projection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    this.volumes.length = 0;
    for (const volume of this.occluders) {
      if (
        volume.normal.dot(this.behind.copy(this.eye).sub(volume.center)) <=
        0.0001
      )
        continue;
      // Halfspaces enclose only the solid cap's shadow cone. Gaps, rounded
      // cutouts, grazing views and partially exposed pieces are never culled.
      const front = volume.planes[0];
      front
        .setFromNormalAndCoplanarPoint(volume.normal, volume.center)
        .negate();
      this.behind.copy(volume.center).sub(this.eye).add(volume.center);
      for (let i = 0; i < volume.world.length; i++) {
        const plane = volume.planes[i + 1];
        plane.setFromCoplanarPoints(
          this.eye,
          volume.world[i],
          volume.world[(i + 1) % volume.world.length],
        );
        if (plane.distanceToPoint(this.behind) < 0) plane.negate();
      }
      this.volumes.push(volume);
    }
    for (const source of this.sources) {
      source.visible =
        source.active &&
        (source.mesh.children.some((child) => child.visible) ||
          (this.frustum.intersectsSphere(source.sphere) &&
            !this.occluded(source)));
    }
    this.restoreCamera();
    for (const batch of this.batches) {
      let count = 0,
        changed = false;
      for (const source of batch.sources) {
        if (!source.visible) continue;
        if (batch.previous[count] !== source) changed = true;
        batch.previous[count] = source;
        count++;
      }
      // A changed prefix requires copying earlier entries too after layout.
      if (changed) {
        for (let i = 0; i < count; i++)
          batch.draw.setMatrixAt(i, batch.previous[i].mesh.matrixWorld);
        batch.draw.instanceMatrix.needsUpdate = true;
      }
      batch.previous.length = count;
      batch.draw.count = count;
      batch.draw.visible = count > 0;
    }
  }

  private occluded(source: Source) {
    const { center, extent } = source;
    for (const volume of this.volumes) {
      if (volume.mesh === source.mesh) continue;
      let contained = true;
      for (const plane of volume.planes) {
        const n = plane.normal;
        if (
          plane.distanceToPoint(center) -
            Math.abs(n.x) * extent.x -
            Math.abs(n.y) * extent.y -
            Math.abs(n.z) * extent.z <=
          0.0001
        ) {
          contained = false;
          break;
        }
      }
      if (contained) return true;
    }
    return false;
  }

  isVisible(mesh: Mesh) {
    return this.byMesh.get(mesh)?.visible ?? isHierarchyVisible(mesh);
  }

  get stats() {
    return {
      components: this.sources.length,
      visible: this.sources.filter((s) => s.visible).length,
      batches: this.batches.filter((b) => b.draw.visible).length,
    };
  }

  dispose() {
    for (const batch of this.batches) batch.draw.dispose();
    for (const batch of this.shadowBatches) batch.draw.dispose();
    this.shadowMaterial.dispose();
  }
}

/** Deduplicate separately constructed but byte-identical centre/core geometry. */
class GeometryCache {
  private readonly known = new Map<BufferGeometry, BufferGeometry>();
  private readonly buckets = new Map<string, BufferGeometry[]>();
  private arrays(geometry: BufferGeometry) {
    return [
      ...Object.keys(geometry.attributes)
        .sort()
        .map((key) => geometry.attributes[key]),
      geometry.index,
    ].filter((a) => a !== null);
  }
  get(geometry: BufferGeometry) {
    const cached = this.known.get(geometry);
    if (cached) return cached;
    const attributes = this.arrays(geometry);
    let hash = 2166136261;
    for (const attribute of attributes) {
      const array = attribute.array;
      const bytes = new Uint8Array(
        array.buffer,
        array.byteOffset,
        array.byteLength,
      );
      for (const value of bytes) hash = Math.imul(hash ^ value, 16777619);
    }
    const key = `${Object.keys(geometry.attributes).sort().join(',')}:${attributes.map((a) => `${a.itemSize}/${a.normalized}/${a.array.constructor.name}/${a.array.length}`).join(',')}:${hash}`;
    const bucket = this.buckets.get(key) || [];
    const equal = bucket.find((candidate) =>
      this.arrays(candidate).every((a, i) =>
        a.array.every((value, j) => value === attributes[i].array[j]),
      ),
    );
    if (!equal) {
      bucket.push(geometry);
      this.buckets.set(key, bucket);
    }
    this.known.set(geometry, equal || geometry);
    return equal || geometry;
  }
}
