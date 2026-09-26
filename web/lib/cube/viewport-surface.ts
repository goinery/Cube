import * as T from 'three';
import { paintSticker, sameStickerArt, type Appearance } from './appearance';
import { COLORS, FACE, FACES, type Face, type Vec } from './model';
import { facesProjection, projectionTransform } from './projection';
import { getState, patch, type AppState } from './store';
import type { createCubeModel } from './viewport-model';
const v3 = (v: Vec) => new T.Vector3(...v);
export function createCubeSurface(
  model: ReturnType<typeof createCubeModel>,
  renderer: T.WebGLRenderer,
  invalidate: () => void,
  isDisposed: () => boolean,
) {
  const { stickers, hitMeshes, clipMaterials } = model;
  const textures = new Map<string, T.CanvasTexture>();
  let artVersion = -1;
  const mappingScene = new T.Scene();
  const ghostMaterials = new Map<string, T.MeshBasicMaterial>();
  for (const [id] of stickers)
    ghostMaterials.set(
      id,
      new T.MeshBasicMaterial({
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.92,
      }),
    );
  const ghostFaces = new Map<
    Face,
    {
      mesh: T.Group;
      tiles: Map<string, T.Mesh>;
    }
  >();
  for (const face of FACES) {
    const mesh = new T.Group(),
      tiles = new Map<string, T.Mesh>();
    mesh.visible = false;
    mappingScene.add(mesh);
    for (const [id, source] of stickers) {
      const tile = new T.Mesh(source.geometry, ghostMaterials.get(id));
      tile.matrixAutoUpdate = false;
      tile.userData = { ...source.userData, mapping: true, face };
      mesh.add(tile);
      tiles.set(id, tile);
      hitMeshes.push(tile);
    }
    ghostFaces.set(face, { mesh, tiles });
  }
  const paintedArt = new Map<string, Appearance>();
  async function updateArt() {
    const s = getState(),
      version = s.artVersion;
    artVersion = version;
    await Promise.all(
      [...stickers].map(async ([id, mesh]) => {
        if (sameStickerArt(paintedArt.get(id), s.appearance, id)) {
          paintedArt.set(id, s.appearance);
          return;
        }
        const material = mesh.material as T.MeshPhysicalMaterial;
        const art = s.appearance.stickers[id];
        const wasMapped = Boolean(material.map);
        if (art.group || art.image || (id === 'U4' && art.color === COLORS.U)) {
          const canvas = document.createElement('canvas');
          await paintSticker(canvas, id, s.appearance);
          if (isDisposed() || getState().artVersion !== version) return;
          let tex = textures.get(id);
          if (tex) {
            tex.image = canvas;
            tex.needsUpdate = true;
          } else {
            tex = new T.CanvasTexture(canvas);
            tex.colorSpace = T.SRGBColorSpace;
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            textures.set(id, tex);
          }
          material.map = tex;
          material.color.set('#ffffff');
        } else {
          textures.get(id)?.dispose();
          material.map = null;
          material.color.set(material.map ? '#ffffff' : art.color);
          textures.delete(id);
        }
        clipMaterials.get(id)?.color.set(art.color);
        const ghost = ghostMaterials.get(id)!;
        ghost.map = material.map;
        ghost.color.copy(material.color);
        if (wasMapped !== Boolean(material.map)) {
          ghost.needsUpdate = true;
          material.needsUpdate = true;
        }
        paintedArt.set(id, s.appearance);
        invalidate();
      }),
    );
  }
  const outlineMaterial = new T.MeshBasicMaterial({
    color: '#d5e6ae',
    side: T.BackSide,
    transparent: true,
    opacity: 0.88,
  });
  const selectedOutlines = new Map<string, T.Mesh>();
  for (const [id, mesh] of stickers) {
    const outline = new T.Mesh(mesh.geometry, outlineMaterial);
    outline.userData.ignoreBounds = true;
    outline.scale.set(1.07, 1.07, 1.08);
    outline.visible = false;
    mesh.add(outline);
    selectedOutlines.set(id, outline);
  }

  function updateProjections(
    s: AppState,
    camera: T.PerspectiveCamera,
    viewTarget: T.Vector3,
    currentExplode: number,
  ) {
    const inner = Math.max(0, currentExplode - 1) * s.settings.internal;
    const direction = camera.position.clone().sub(viewTarget).normalize(),
      anchors: typeof s.faceAnchors = {},
      visible: Face[] = [];
    const centerProjection = new T.Vector3(0, 0, 0).project(camera);
    for (const [face, g] of ghostFaces) {
      const f = FACE[face],
        normal = v3(f.n),
        facing = normal.dot(direction);
      if (facing > 0.13) visible.push(face);
      g.mesh.visible = s.view === 'hidden' && !s.presentation && facing <= 0.13;
      if (!g.mesh.visible) continue;
      const radius =
          1 +
          s.settings.gap +
          currentExplode * 0.72 +
          (0.507 + s.settings.stickerOffset + inner * 0.95) * s.settings.size,
        raw = normal
          .clone()
          .multiplyScalar(radius + 1.8 + s.settings.explode * 0.7),
        projection = raw.clone().project(camera);
      let dx = projection.x - centerProjection.x,
        dy = projection.y - centerProjection.y;
      if (Math.hypot(dx, dy) < 0.07) {
        dx = face === 'B' ? 0.7 : face === 'F' ? -0.7 : face === 'R' ? 1 : -1;
        dy = -0.45;
      }
      const length = Math.hypot(dx, dy),
        nx = dx / length,
        ny = dy / length;
      const behind = viewTarget
          .clone()
          .sub(camera.position)
          .normalize()
          .multiplyScalar(radius * 2 + 2.4)
          .add(viewTarget)
          .project(camera).z,
        ndc = new T.Vector3(
          T.MathUtils.clamp(centerProjection.x + nx * 0.78, -0.8, 0.8),
          T.MathUtils.clamp(centerProjection.y + ny * 0.68, -0.68, 0.64),
          behind,
        );
      const target = ndc.clone().unproject(camera);
      g.mesh.position.copy(target);
      const adjusted = normal.clone();
      if (Math.abs(facing) < 0.3)
        adjusted
          .addScaledVector(
            direction,
            facing < 0 ? -(0.3 - Math.abs(facing)) : 0.3 - Math.abs(facing),
          )
          .normalize();
      const q = new T.Quaternion().setFromUnitVectors(normal, adjusted),
        basis = new T.Matrix4().makeBasis(v3(f.r), v3(f.u), normal);
      g.mesh.quaternion.setFromRotationMatrix(basis).premultiply(q);
      const viewHeight =
        2 *
        camera.position.distanceTo(target) *
        Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      const scale =
        Math.min(viewHeight * 0.22, viewHeight * camera.aspect * 0.23) /
        (radius * 2);
      g.mesh.scale.setScalar(scale);
      const transform = projectionTransform(
        face,
        radius,
        adjusted.dot(direction) > 0,
      );
      for (const [id, tile] of g.tiles) {
        const source = stickers.get(id)!;
        tile.visible = facesProjection(source.matrixWorld, face);
        if (tile.visible)
          tile.matrix.multiplyMatrices(transform, source.matrixWorld);
      }
      g.mesh.updateMatrixWorld(true);
      const top = new T.Vector3(0, radius + 0.2, 0)
          .applyMatrix4(g.mesh.matrixWorld)
          .project(camera),
        origin = normal.clone().multiplyScalar(radius).project(camera);
      anchors[face] = {
        x: (top.x + 1) * 50,
        y: (1 - top.y) * 50,
        fromX: (origin.x + 1) * 50,
        fromY: (1 - origin.y) * 50,
      };
    }
    if (
      visible.join('') !== s.visibleFaces.join('') ||
      JSON.stringify(anchors) !== JSON.stringify(s.faceAnchors)
    )
      patch({ visibleFaces: visible, faceAnchors: anchors });
  }
  return {
    mappingScene,
    selectedOutlines,
    updateArt,
    updateProjections,
    get artVersion() {
      return artVersion;
    },
    dispose() {
      textures.forEach((texture) => texture.dispose());
      ghostMaterials.forEach((material) => material.dispose());
    },
  };
}
