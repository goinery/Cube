import { tx } from '@/lib/i18n';
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
  const materials: T.MeshBasicMaterial[] = [];
  const labels = document.createElement('div');
  labels.className = 'projection-labels';
  labels.setAttribute('aria-label', tx('legacy.m498'));
  const faces = normals.map((_, face) => {
    const group = new T.Group(),
      tiles = new Map<string, T.Mesh>();
    group.visible = false;
    scene.add(group);
    const label = document.createElement('button');
    label.className = 'projection-label';
    label.textContent = `${FACE_NAMES[face]} ↗`;
    label.setAttribute(
      'aria-label',
      tx('legacy.m499', { p0: FACE_NAMES[face] }),
    );
    label.addEventListener('click', () => onFace(face));
    labels.append(label);
    for (const [id, source] of sources) {
      const material = new T.MeshBasicMaterial({
        side: T.DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      materials.push(material);
      const tile = new T.Mesh(source.geometry, material);
      tile.matrixAutoUpdate = false;
      tile.userData = { ...source.userData, mapping: true };
      group.add(tile);
      tiles.set(id, tile);
      hits.push(tile);
    }
    return { group, tiles, label, opacity: 0, initialized: false };
  });
  function update(
    s: State,
    camera: T.PerspectiveCamera,
    target: T.Vector3,
    visibility = s.view === 'hidden' && !s.presentation ? 1 : 0,
    dt = 1 / 60,
  ) {
    const active = visibility > 0;
    labels.hidden = !active;
    labels.style.display = active ? '' : 'none';
    if (!active) {
      faces.forEach(({ group }) => {
        group.visible = false;
      });
      return false;
    }
    let moving = false;
    const direction = camera.position.clone().sub(target).normalize();
    const center = new T.Vector3().project(camera);
    const radius =
      2.4 +
      s.settings.explode * 1.18 +
      Math.max(0, s.settings.explode - 1) *
        (0.35 + s.settings.internal * 0.51) +
      s.settings.stickerOffset;
    const behind = target
      .clone()
      .addScaledVector(direction, -(radius * 2 + 2.4))
      .project(camera).z;
    for (let face = 0; face < faces.length; face++) {
      const entry = faces[face],
        { group, tiles, label } = entry,
        normal = normals[face];
      const facing = normal.dot(direction);
      const opacity = 1 - T.MathUtils.smoothstep(facing, -0.08, 0.16);
      entry.opacity = T.MathUtils.damp(entry.opacity, opacity, 12, dt);
      if (Math.abs(entry.opacity - opacity) < 0.001) entry.opacity = opacity;
      moving ||= entry.opacity !== opacity;
      group.visible = entry.opacity * visibility > 0.001;
      label.hidden = !group.visible;
      label.style.display = group.visible ? '' : 'none';
      label.style.opacity = String(entry.opacity * visibility);
      label.style.pointerEvents =
        s.view === 'hidden' &&
        !s.presentation &&
        entry.opacity * visibility > 0.5
          ? 'auto'
          : 'none';
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
      const blend = entry.initialized ? 1 - Math.exp(-dt * 12) : 1;
      group.position.lerp(position, blend);
      if (group.position.distanceTo(position) < 0.001)
        group.position.copy(position);
      else moving = true;
      const adjusted = normal.clone();
      // Keep the auxiliary face on the same side throughout its fade, avoiding
      // a mirrored jump as the physical face crosses the camera's horizon.
      if (facing > -0.3)
        adjusted.addScaledVector(direction, -0.3 - facing).normalize();
      const orientation = new T.Quaternion()
        .setFromRotationMatrix(FACE_BASES[face].basis)
        .premultiply(new T.Quaternion().setFromUnitVectors(normal, adjusted));
      group.quaternion.slerp(orientation, blend);
      if (group.quaternion.angleTo(orientation) < 0.001)
        group.quaternion.copy(orientation);
      else moving = true;
      const viewHeight =
        2 *
        camera.position.distanceTo(position) *
        Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      const scale =
        Math.min(viewHeight * 0.21, viewHeight * camera.aspect * 0.23) /
        (radius * 2);
      const currentScale = T.MathUtils.lerp(group.scale.x, scale, blend);
      group.scale.setScalar(
        Math.abs(currentScale - scale) < 0.00001 ? scale : currentScale,
      );
      moving ||= group.scale.x !== scale;
      entry.initialized = true;
      const transform = projectionTransform(face);
      for (const [id, tile] of tiles) {
        const source = sources.get(id)!;
        const material = tile.material as T.MeshBasicMaterial;
        if (material.map !== source.material.map) {
          material.map = source.material.map;
          material.needsUpdate = true;
        }
        material.color
          .copy(source.material.color)
          .add(
            source.material.emissive
              .clone()
              .multiplyScalar(source.material.emissiveIntensity),
          );
        material.opacity = 0.92 * entry.opacity * visibility;
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
    return moving;
  }
  function dispose() {
    labels.remove();
    materials.forEach((material) => material.dispose());
    // Geometry and image textures are shared with the physical model.
    scene.clear();
  }
  return { scene, hits, labels, update, dispose };
}
