import * as T from 'three';
import { heldAngle } from './interaction';
import { FACE, type Piece, type Vec } from './model';
import { getState } from './store';
import type { createCubeModel } from './viewport-model';
const v3 = (v: Vec) => new T.Vector3(...v);
export function basisQuaternion(p: Piece) {
  return new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(v3(p.basis[0]), v3(p.basis[1]), v3(p.basis[2])),
  );
}

export function createCubeLayout(model: ReturnType<typeof createCubeModel>) {
  const { models, stickers } = model;
  let layoutState: ReturnType<typeof getState> | undefined,
    layoutExplode = NaN,
    wasTurning = false;
  const orientations = new WeakMap<Piece, T.Quaternion>();
  const heldAxis = new T.Vector3(),
    heldRotation = new T.Quaternion();
  function update(explode: number, turning: boolean) {
    const s = getState(),
      inner = Math.max(0, explode - 1) * s.settings.internal;
    const before = layoutState?.settings;
    const partsChanged =
      !before ||
      explode !== layoutExplode ||
      s.settings.internal !== before.internal ||
      s.settings.stickerOffset !== before.stickerOffset ||
      s.settings.showMagnets !== before.showMagnets;
    const shapeChanged =
      partsChanged ||
      s.cube !== layoutState?.cube ||
      s.partialTurns !== layoutState?.partialTurns ||
      s.settings.gap !== before?.gap ||
      s.settings.size !== before?.size ||
      turning ||
      wasTurning;
    const materialChanged = s.settings.roughness !== before?.roughness;
    layoutState = s;
    layoutExplode = explode;
    wasTurning = turning;
    if (!shapeChanged && !materialChanged) return false;
    for (const p of s.cube) {
      const m = models.get(p.id)!;
      m.root.position
        .set(...p.pos)
        .multiplyScalar(1 + s.settings.gap + explode * 0.72);
      let orientation = orientations.get(p);
      if (!orientation) {
        orientation = basisQuaternion(p);
        orientations.set(p, orientation);
      }
      m.root.quaternion.copy(orientation);
      m.root.scale.setScalar(s.settings.size);
      if (partsChanged)
        for (const part of m.parts) {
          part.object.position
            .copy(part.base)
            .addScaledVector(part.direction, inner * part.amount);
          part.object.visible = !part.magnet || s.settings.showMagnets;
          part.object.updateMatrix();
        }
      for (const sticker of p.stickers) {
        const mesh = stickers.get(sticker.id)!;
        if (partsChanged) {
          mesh.position.addScaledVector(
            v3(FACE[sticker.face].n),
            s.settings.stickerOffset,
          );
          mesh.updateMatrix();
        }
        if (materialChanged) {
          const material = mesh.material as T.MeshPhysicalMaterial;
          material.roughness = s.settings.roughness;
          material.clearcoatRoughness = 0.07 + s.settings.roughness * 0.25;
        }
      }
      if (s.partialTurns) {
        const axis = s.partialTurns.axis;
        const q = heldRotation.setFromAxisAngle(
          heldAxis.set(0, 0, 0).setComponent(axis, 1),
          heldAngle(s.partialTurns, axis, p.pos[axis]),
        );
        m.root.position.applyQuaternion(q);
        m.root.quaternion.premultiply(q);
      }
      m.root.updateMatrix();
    }
    return shapeChanged;
  }

  return update;
}
