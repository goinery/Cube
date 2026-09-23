import * as T from 'three';
import type { Definition } from './types';

export interface FaceAnchor {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  opacity: number;
}
export class HiddenFaces {
  readonly scene = new T.Scene();
  readonly hitMeshes: T.Mesh[] = [];
  private faces = new Map<
    string,
    { root: T.Group; tiles: Map<string, T.Mesh>; opacity: number }
  >();
  private materials = new Map<string, T.MeshBasicMaterial>();
  constructor(
    private def: Definition,
    private caps: Map<string, T.Mesh>,
  ) {
    for (const face of def.faces) {
      const root = new T.Group(),
        tiles = new Map<string, T.Mesh>();
      this.scene.add(root);
      for (const [id, source] of caps) {
        const material = new T.MeshBasicMaterial({
          side: T.DoubleSide,
          transparent: true,
          opacity: 0,
        });
        this.materials.set(`${face.id}/${id}`, material);
        const tile = new T.Mesh(source.geometry, material);
        tile.matrixAutoUpdate = false;
        tile.userData = { ...source.userData, mapping: true, face: face.id };
        root.add(tile);
        tiles.set(id, tile);
        this.hitMeshes.push(tile);
      }
      this.faces.set(face.id, { root, tiles, opacity: 0 });
    }
  }
  update(
    camera: T.PerspectiveCamera,
    target: T.Vector3,
    enabled: boolean,
    radius: number,
    dt: number,
  ) {
    const direction = camera.position.clone().sub(target).normalize(),
      center = new T.Vector3().project(camera),
      anchors: Record<string, FaceAnchor> = {};
    let moving = false;
    const hidden = this.def.faces.filter(
      (f) => new T.Vector3(...f.normal).dot(direction) <= 0.13,
    );
    for (const face of this.def.faces) {
      const group = this.faces.get(face.id)!,
        normal = new T.Vector3(...face.normal),
        facing = normal.dot(direction),
        goal = enabled && facing <= 0.13 ? 1 : 0;
      group.opacity = T.MathUtils.damp(group.opacity, goal, 12, dt);
      if (Math.abs(group.opacity - goal) < 0.001) group.opacity = goal;
      else moving = true;
      group.root.visible = group.opacity > 0.001;
      if (!group.root.visible) continue;
      const raw = normal
          .clone()
          .multiplyScalar(radius + 1.8)
          .project(camera),
        delta = new T.Vector2(raw.x - center.x, raw.y - center.y);
      if (delta.length() < 0.07) delta.set(face.id === 'B' ? 0.7 : -0.7, -0.45);
      delta.normalize();
      const depth = target
        .clone()
        .addScaledVector(direction, -radius * 2 - 2.4)
        .project(camera).z;
      let x = T.MathUtils.clamp(center.x + delta.x * 0.78, -0.8, 0.8),
        y = T.MathUtils.clamp(center.y + delta.y * 0.68, -0.68, 0.64);
      if (this.def.id === 'megaminx') {
        const side = hidden
          .filter((f) => {
            const p = new T.Vector3(...f.normal).project(camera);
            return p.x < center.x === x < center.x;
          })
          .sort(
            (a, b) =>
              new T.Vector3(...b.normal).project(camera).y -
              new T.Vector3(...a.normal).project(camera).y,
          );
        const index = side.findIndex((f) => f.id === face.id);
        if (index >= 0) {
          x = x < center.x ? -0.78 : 0.78;
          y = 0.62 - (index * 1.24) / Math.max(1, side.length - 1);
        }
      }
      const destination = new T.Vector3(x, y, depth).unproject(camera);
      group.root.position.copy(destination);
      const adjusted = normal.clone();
      if (Math.abs(facing) < 0.3)
        adjusted
          .addScaledVector(
            direction,
            facing < 0 ? -(0.3 - Math.abs(facing)) : 0.3 - Math.abs(facing),
          )
          .normalize();
      const orientation = new T.Quaternion()
        .setFromRotationMatrix(
          new T.Matrix4().makeBasis(
            new T.Vector3(...face.right),
            new T.Vector3(...face.up),
            normal,
          ),
        )
        .premultiply(new T.Quaternion().setFromUnitVectors(normal, adjusted));
      group.root.quaternion.copy(orientation);
      const viewHeight =
          2 *
          camera.position.distanceTo(destination) *
          Math.tan(T.MathUtils.degToRad(camera.fov / 2)),
        fraction = this.def.id === 'megaminx' ? 0.14 : 0.22;
      group.root.scale.setScalar(
        Math.min(viewHeight * fraction, viewHeight * camera.aspect * 0.23) /
          (radius * 2),
      );
      const transform = new T.Matrix4()
        .makeRotationY(adjusted.dot(direction) > 0 ? Math.PI : 0)
        .multiply(
          new T.Matrix4().makeTranslation(
            0,
            0,
            -new T.Vector3(...face.center).length(),
          ),
        )
        .multiply(
          new T.Matrix4()
            .makeBasis(
              new T.Vector3(...face.right),
              new T.Vector3(...face.up),
              normal,
            )
            .invert(),
        );
      for (const [id, tile] of group.tiles) {
        const source = this.caps.get(id)!,
          origin = this.def.faces.find(
            (f) => f.id === this.def.tiles.find((t) => t.id === id)!.face,
          )!,
          n = new T.Vector3(...origin.normal).transformDirection(
            source.matrixWorld,
          );
        const adjacentNormal = this.def.id === 'megaminx' ? 1 / Math.sqrt(5) : 0;
        tile.visible = n.dot(normal) > adjacentNormal + 0.001;
        if (tile.visible)
          tile.matrix.multiplyMatrices(transform, source.matrixWorld);
        const material = tile.material as T.MeshBasicMaterial,
          original = source.material as T.MeshPhysicalMaterial;
        if (material.map !== original.map) {
          material.map = original.map;
          material.needsUpdate = true;
        }
        material.color.copy(original.color);
        if (original.emissive.r > 0)
          material.color.lerp(new T.Color('#d5e6ae'), 0.45);
        material.opacity = 0.92 * group.opacity;
      }
      group.root.updateMatrixWorld(true);
      const top = new T.Vector3(0, radius + 0.16, 0)
          .applyMatrix4(group.root.matrixWorld)
          .project(camera),
        from = new T.Vector3(...face.center).project(camera);
      anchors[face.id] = {
        x: (top.x + 1) * 50,
        y: (1 - top.y) * 50,
        fromX: (from.x + 1) * 50,
        fromY: (1 - from.y) * 50,
        opacity: group.opacity,
      };
    }
    return { anchors, moving };
  }
  render(renderer: T.WebGLRenderer, camera: T.Camera) {
    renderer.autoClear = false;
    renderer.render(this.scene, camera);
    renderer.autoClear = true;
  }
  dispose() {
    this.materials.forEach((m) => m.dispose());
  }
}
