import * as T from 'three';
import { FACE_NAMES, FACE_VERTICES } from './model';
import { normals, vertices } from './geometry';
import type { State } from './store';

export const FACE_BASES = FACE_VERTICES.map((ids, face) => {
  const normal = normals[face];
  const center = normal.clone().multiplyScalar(0.8);
  const y = vertices[ids[0]].clone().sub(center).normalize();
  const x = y.clone().cross(normal);
  const basis = new T.Matrix4().makeBasis(x, y, normal);
  return { center, x, y, basis, inverse: basis.clone().invert() };
});

export function projectionTransform(face: number, reverse = false) {
  return new T.Matrix4()
    .makeRotationY(reverse ? Math.PI : 0)
    .multiply(new T.Matrix4().makeTranslation(0, 0, -0.8))
    .multiply(FACE_BASES[face].inverse);
}

export function facesProjection(world: T.Matrix4, face: number) {
  return (
    new T.Vector3(0, 0, 1).transformDirection(world).dot(normals[face]) > 0.001
  );
}

type SourceTiles = Map<
  string,
  T.Mesh<T.BufferGeometry, T.MeshPhysicalMaterial>
>;
export function createHiddenProjections(
  sources: SourceTiles,
  onFace: (face: number) => void,
) {
  const scene = new T.Scene(),
    hits: T.Mesh[] = [];
  const materials = new Map<string, T.MeshBasicMaterial>();
  const labels = document.createElement('div');
  labels.className = 'projection-labels';
  labels.setAttribute('aria-label', '随金字塔朝向变化的隐藏面投影');
  for (const [id] of sources)
    materials.set(
      id,
      new T.MeshBasicMaterial({
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.92,
      }),
    );
  const faces = normals.map((_, face) => {
    const group = new T.Group(),
      tiles = new Map<string, T.Mesh>();
    group.visible = false;
    scene.add(group);
    const label = document.createElement('button');
    label.className = 'projection-label';
    label.textContent = `${FACE_NAMES[face]} ↗`;
    label.setAttribute('aria-label', `查看${FACE_NAMES[face]}`);
    label.addEventListener('click', () => onFace(face));
    labels.append(label);
    for (const [id, source] of sources) {
      const tile = new T.Mesh(source.geometry, materials.get(id));
      tile.matrixAutoUpdate = false;
      tile.userData = { ...source.userData, mapping: true };
      group.add(tile);
      tiles.set(id, tile);
      hits.push(tile);
    }
    return { group, tiles, label };
  });
  function update(s: State, camera: T.PerspectiveCamera, target: T.Vector3) {
    const active = s.view === 'hidden' && !s.presentation;
    labels.hidden = !active;
    labels.style.display = active ? '' : 'none';
    if (!active) {
      faces.forEach(({ group }) => {
        group.visible = false;
      });
      return;
    }
    for (const [id, material] of materials) {
      const source = sources.get(id)!.material;
      if (material.map !== source.map) {
        material.map = source.map;
        material.needsUpdate = true;
      }
      material.color
        .copy(source.color)
        .add(source.emissive.clone().multiplyScalar(source.emissiveIntensity));
    }
    const direction = camera.position.clone().sub(target).normalize();
    const center = new T.Vector3().project(camera);
    const radius =
      2.4 +
      s.settings.explode * (0.8 + s.settings.internal * 0.75) +
      s.settings.stickerOffset;
    const behind = target
      .clone()
      .addScaledVector(direction, -(radius * 2 + 2.4))
      .project(camera).z;
    for (let face = 0; face < faces.length; face++) {
      const { group, tiles, label } = faces[face],
        normal = normals[face];
      const facing = normal.dot(direction);
      group.visible = facing <= 0.13;
      label.hidden = !group.visible;
      label.style.display = group.visible ? '' : 'none';
      if (!group.visible) continue;
      const raw = normal
        .clone()
        .multiplyScalar(radius + 1.8)
        .project(camera);
      let dx = raw.x - center.x,
        dy = raw.y - center.y;
      if (Math.hypot(dx, dy) < 0.07) {
        const angle = -Math.PI / 2 + (face * Math.PI * 2) / 3;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
      }
      const length = Math.hypot(dx, dy);
      const position = new T.Vector3(
        T.MathUtils.clamp(center.x + (dx / length) * 0.76, -0.8, 0.8),
        T.MathUtils.clamp(center.y + (dy / length) * 0.64, -0.68, 0.62),
        behind,
      ).unproject(camera);
      group.position.copy(position);
      const adjusted = normal.clone();
      if (Math.abs(facing) < 0.3)
        adjusted
          .addScaledVector(
            direction,
            facing < 0 ? -(0.3 - Math.abs(facing)) : 0.3 - Math.abs(facing),
          )
          .normalize();
      group.quaternion
        .setFromRotationMatrix(FACE_BASES[face].basis)
        .premultiply(new T.Quaternion().setFromUnitVectors(normal, adjusted));
      const viewHeight =
        2 *
        camera.position.distanceTo(position) *
        Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      group.scale.setScalar(
        Math.min(viewHeight * 0.21, viewHeight * camera.aspect * 0.23) /
          (radius * 2),
      );
      const transform = projectionTransform(face, adjusted.dot(direction) > 0);
      for (const [id, tile] of tiles) {
        const source = sources.get(id)!;
        tile.visible = facesProjection(source.matrixWorld, face);
        if (tile.visible)
          tile.matrix.multiplyMatrices(transform, source.matrixWorld);
      }
      group.updateMatrixWorld(true);
      const top = new T.Vector3(0, radius + 0.2, 0)
        .applyMatrix4(group.matrixWorld)
        .project(camera);
      label.style.left = `${T.MathUtils.clamp((top.x + 1) * 50, 7, 93)}%`;
      label.style.top = `${T.MathUtils.clamp((1 - top.y) * 50, 9, 91)}%`;
    }
  }
  function dispose() {
    labels.remove();
    materials.forEach((material) => material.dispose());
    // Geometry and image textures are shared with the physical model.
    scene.clear();
  }
  return { scene, hits, labels, update, dispose };
}
