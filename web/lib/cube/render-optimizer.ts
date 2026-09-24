import {
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
import { OcclusionCoverage } from '../rendering/occlusion';

interface Source {
  mesh: Mesh;
  matrix: Matrix4;
  version: number;
  sphere: Sphere;
  active: boolean;
  visible: boolean;
  localBounds: Vector3[];
  worldBounds: Vector3[];
}
interface Batch {
  sources: Source[];
  draw: InstancedMesh;
  previous: Source[];
  versions: number[];
}
interface Occluder {
  mesh: Mesh;
  local: Vector3[];
  world: Vector3[];
  planes: Plane[];
  center: Vector3;
  normal: Vector3;
  localCenter: Vector3;
  localNormal: Vector3;
  version: number;
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
  private readonly eye = new Vector3();
  private readonly behind = new Vector3();
  private readonly volumes: Occluder[] = [];
  private readonly coverage = new OcclusionCoverage();
  private perspective = true;
  private readonly volumeCulling: boolean;
  private cameraDirty = true;
  private readonly lastView = new Matrix4();
  private readonly lastProjection = new Matrix4();

  constructor(
    mechanics: Mesh[],
    private readonly caps: Mesh[],
    options: { shadows?: boolean; occlusion?: 'coverage' } = {},
  ) {
    this.volumeCulling = options.occlusion !== 'coverage';
    this.group.name = 'Visible mechanical instances';
    this.group.add(this.main, this.shadows);
    const grouped = new Map<string, Source[]>();
    const shadowGroups = new Map<BufferGeometry, Source[]>();
    const geometryCache = new GeometryCache();
    for (const mesh of [...mechanics, ...caps]) {
      if (!mesh.geometry.getAttribute('position').count) {
        mesh.visible = false;
        mesh.layers.set(1);
        continue;
      }
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const bounds = mesh.geometry.boundingBox!;
      const localBounds = Array.from(
        { length: 8 },
        (_, i) =>
          new Vector3(
            i & 1 ? bounds.max.x : bounds.min.x,
            i & 2 ? bounds.max.y : bounds.min.y,
            i & 4 ? bounds.max.z : bounds.min.z,
          ),
      );
      const source: Source = {
        mesh,
        matrix: new Matrix4(),
        version: 0,
        sphere: new Sphere(),
        active: true,
        visible: true,
        localBounds,
        worldBounds: localBounds.map(() => new Vector3()),
      };
      this.sources.push(source);
      this.byMesh.set(mesh, source);
      if (mesh.castShadow && options.shadows !== false) {
        const geometry = geometryCache.get(mesh.geometry);
        const shadows = shadowGroups.get(geometry) || [];
        shadows.push(source);
        shadowGroups.set(geometry, shadows);
      }
    }
    for (const mesh of mechanics) {
      if (!this.byMesh.has(mesh)) continue;
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
      this.batches.push({ sources, draw, previous: [], versions: [] });
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
      const polygon = mesh.geometry.userData.occluder as number[][] | undefined;
      // Mitred corners can collapse consecutive outline vertices onto one
      // point. Such zero-length edges cannot define a coverage halfspace.
      const points = polygon?.filter((p, i) => {
        const next = polygon[(i + 1) % polygon.length];
        return (
          Math.hypot(p[0] - next[0], p[1] - next[1], p[2] - next[2]) > 1e-8
        );
      });
      if (!points || points.length < 3) continue;
      const local = points.map(
        (p) => new Vector3(...(p as [number, number, number])),
      );
      this.occluders.push({
        mesh,
        local,
        world: points.map(() => new Vector3()),
        planes: Array.from({ length: points.length + 1 }, () => new Plane()),
        center: new Vector3(),
        normal: new Vector3(),
        localCenter: local
          .reduce((center, p) => center.add(p), new Vector3())
          .multiplyScalar(1 / local.length),
        localNormal: new Vector3(
          ...((mesh.geometry.userData.occluderNormal ?? [0, 0, 1]) as [
            number,
            number,
            number,
          ]),
        ),
        version: -1,
      });
    }
  }

  updateBounds() {
    this.cameraDirty = true;
    // Caps may still carry the preceding view's visibility flag.
    for (const cap of this.caps) cap.visible = true;
    for (const source of this.sources) {
      const { mesh } = source;
      source.active = isHierarchyVisible(mesh);
      if (source.version > 0 && source.matrix.equals(mesh.matrixWorld))
        continue;
      source.matrix.copy(mesh.matrixWorld);
      source.version++;
      source.sphere
        .copy(mesh.geometry.boundingSphere!)
        .applyMatrix4(mesh.matrixWorld);
      source.worldBounds.forEach((p, i) =>
        p.copy(source.localBounds[i]).applyMatrix4(mesh.matrixWorld),
      );
    }
    for (const occluder of this.occluders) {
      const version = this.byMesh.get(occluder.mesh)!.version;
      if (version === occluder.version) continue;
      occluder.version = version;
      occluder.center
        .copy(occluder.localCenter)
        .applyMatrix4(occluder.mesh.matrixWorld);
      occluder.normal
        .copy(occluder.localNormal)
        .transformDirection(occluder.mesh.matrixWorld);
      occluder.world.forEach((p, i) =>
        p.copy(occluder.local[i]).applyMatrix4(occluder.mesh.matrixWorld),
      );
    }
  }

  prepareShadow(camera?: Camera) {
    // Camera-hidden parts can still cast visible shadows. Use a separate full
    // instance buffer for the light pass; view culling never truncates it.
    this.main.visible = false;
    this.shadows.visible = true;
    for (const cap of this.caps) cap.visible = false;
    if (camera) this.prepareOcclusion(camera);
    for (const batch of this.shadowBatches) {
      let count = 0;
      for (const source of batch.sources)
        if (
          source.active &&
          source.mesh.castShadow &&
          (!camera ||
            (this.frustum.intersectsSphere(source.sphere) &&
              !this.occluded(source)))
        )
          batch.draw.setMatrixAt(count++, source.mesh.matrixWorld);
      batch.draw.count = count;
      batch.draw.visible = count > 0;
      batch.draw.instanceMatrix.needsUpdate = true;
    }
  }

  restoreCamera() {
    this.main.visible = true;
    this.shadows.visible = false;
    for (const cap of this.caps)
      cap.visible = this.byMesh.get(cap)?.visible ?? false;
  }

  private prepareOcclusion(camera: Camera) {
    this.perspective = camera.projectionMatrix.elements[15] === 0;
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    this.frustum.setFromProjectionMatrix(
      this.projection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    this.volumes.length = 0;
    this.coverage.reset(this.projection);
    for (const volume of this.occluders) {
      if (!this.byMesh.get(volume.mesh)?.active) continue;
      if (
        volume.normal.dot(this.behind.copy(this.eye).sub(volume.center)) <=
        0.0001
      )
        continue;
      this.coverage.add(volume.world);
      if (!this.perspective || !this.volumeCulling) continue;
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
  }

  prepareCamera(camera: Camera) {
    if (
      !this.cameraDirty &&
      this.lastView.equals(camera.matrixWorldInverse) &&
      this.lastProjection.equals(camera.projectionMatrix)
    ) {
      this.restoreCamera();
      return;
    }
    this.cameraDirty = false;
    this.lastView.copy(camera.matrixWorldInverse);
    this.lastProjection.copy(camera.projectionMatrix);
    this.prepareOcclusion(camera);
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
        firstChanged = Infinity,
        lastChanged = -1;
      for (const source of batch.sources) {
        if (!source.visible) continue;
        if (
          batch.previous[count] !== source ||
          batch.versions[count] !== source.version
        ) {
          batch.draw.setMatrixAt(count, source.mesh.matrixWorld);
          firstChanged = Math.min(firstChanged, count);
          lastChanged = count;
        }
        batch.previous[count] = source;
        batch.versions[count] = source.version;
        count++;
      }
      if (lastChanged >= 0) {
        batch.draw.instanceMatrix.addUpdateRange(
          firstChanged * 16,
          (lastChanged - firstChanged + 1) * 16,
        );
        batch.draw.instanceMatrix.needsUpdate = true;
      }
      batch.previous.length = count;
      batch.versions.length = count;
      batch.draw.count = count;
      batch.draw.visible = count > 0;
    }
  }

  private occluded(source: Source) {
    for (const volume of this.perspective ? this.volumes : []) {
      if (volume.mesh === source.mesh) continue;
      let contained = true;
      for (const plane of volume.planes) {
        if (
          source.worldBounds.some(
            (corner) => plane.distanceToPoint(corner) <= 0.0001,
          )
        ) {
          contained = false;
          break;
        }
      }
      if (contained) return true;
    }
    return this.coverage.occludes(source.worldBounds);
  }

  /** Upload every active instance once before interaction, including occluded
   * mechanisms. The warmup target is offscreen and is never presented. */
  prepareWarmup() {
    this.cameraDirty = true;
    this.main.visible = true;
    this.shadows.visible = false;
    for (const cap of this.caps) cap.visible = true;
    for (const batch of this.batches) {
      let count = 0;
      for (const source of batch.sources)
        if (source.active)
          batch.draw.setMatrixAt(count++, source.mesh.matrixWorld);
      batch.draw.count = count;
      batch.draw.visible = count > 0;
      // Warmup overwrites the entire buffer, including previously hidden slots.
      batch.draw.instanceMatrix.clearUpdateRanges();
      batch.draw.instanceMatrix.needsUpdate = true;
      batch.previous = [];
      batch.versions = [];
    }
  }

  isVisible(mesh: Mesh) {
    return this.byMesh.get(mesh)?.visible ?? isHierarchyVisible(mesh);
  }

  invalidateVisibility() {
    this.cameraDirty = true;
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
    const key = `${JSON.stringify(geometry.groups)}:${Object.keys(geometry.attributes).sort().join(',')}:${attributes.map((a) => `${a.itemSize}/${a.normalized}/${a.array.constructor.name}/${a.array.length}`).join(',')}:${hash}`;
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
