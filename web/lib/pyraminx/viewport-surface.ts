import { tx } from '@/lib/i18n';
import * as T from 'three';
import { paintPhoto } from './appearance';
import { normals, vertices, type createModel } from './geometry';
import { FACE_NAMES, FACE_VERTICES, TILES } from './model';
import { FACE_BASES } from './projection';
import { getState, notify, type Photo, type State } from './store';
export function createPyraminxSurface(
  model: ReturnType<typeof createModel>,
  maps: HTMLCanvasElement,
  invalidate: () => void,
  isDisposed: () => boolean,
) {
  const textures = new Map<
      string,
      {
        src: string;
        texture: T.CanvasTexture;
        image: HTMLImageElement;
        photo: Photo;
      }
    >(),
    pendingPhotos = new Map<string, string>();
  function updateAppearance(s: State) {
    for (const tile of TILES) {
      const mesh = model.tiles.get(tile.id)!,
        photo = s.photos[tile.face];
      mesh.material.roughness = s.settings.roughness;
      mesh.material.emissive.set(
        s.selected.includes(tile.id) ? '#566c38' : '#000000',
      );
      mesh.material.emissiveIntensity = 0.28;
      mesh.material.color.set(photo ? '#ffffff' : s.colors[tile.id]);
      const entry = textures.get(String(tile.face));
      const map = photo && entry?.src === photo.src ? entry.texture : null;
      if (mesh.material.map !== map) {
        mesh.material.map = map;
        mesh.material.needsUpdate = true;
      }
    }
    for (let face = 0; face < 4; face++) {
      const photo = s.photos[face],
        old = textures.get(String(face));
      if (!photo) {
        if (old) {
          old.texture.dispose();
          textures.delete(String(face));
        }
        continue;
      }
      if (old?.src === photo.src) {
        if (old.photo !== photo) {
          paintPhoto(old.texture.image, old.image, photo);
          old.texture.needsUpdate = true;
          old.photo = photo;
        }
        continue;
      }
      if (pendingPhotos.get(String(face)) === photo.src) continue;
      pendingPhotos.set(String(face), photo.src);
      const img = new Image();
      img.src = photo.src;
      void img
        .decode()
        .then(() => {
          if (isDisposed() || getState().photos[face]?.src !== photo.src)
            return;
          const currentPhoto = getState().photos[face];
          const c = document.createElement('canvas');
          paintPhoto(c, img, currentPhoto);
          const texture = new T.CanvasTexture(c);
          texture.colorSpace = T.SRGBColorSpace;
          texture.anisotropy = 4;
          textures.get(String(face))?.texture.dispose();
          textures.set(String(face), {
            src: photo.src,
            texture,
            image: img,
            photo: currentPhoto,
          });
          pendingPhotos.delete(String(face));
          updateAppearance(getState());
          invalidate();
        })
        .catch(() => {
          if (!isDisposed()) {
            pendingPhotos.delete(String(face));
            notify(tx('legacy.m300'));
          }
        });
    }
  }
  const faceBases = FACE_BASES;
  function drawMaps(
    s: State,
    net: boolean,
    opacity: number,
    width: number,
    height: number,
  ) {
    const ctx = maps.getContext('2d')!;
    if (opacity < 0.001) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    const faces = [0, 1, 2, 3];
    const side = net
      ? Math.min(width * 0.4, height * 0.42, 280)
      : Math.min(width / Math.max(faces.length, 2) - 20, 120);
    const h = (side * Math.sqrt(3)) / 2;
    const currentN = new T.Vector3(),
      q = new T.Quaternion();
    faces.forEach((face, index) => {
      let cx = 22 + side / 2 + index * (side + 14),
        cy = height - 112 - h / 2;
      let angle = 0;
      if (net) {
        const centerX = width / 2,
          centerY = height / 2 - 8;
        if (index === 0) {
          cx = centerX;
          cy = centerY;
        } else {
          const shared = FACE_VERTICES[0].filter((v) => v !== face);
          const project = (f: number, v: number) => {
            const basis = faceBases[f],
              p = vertices[v].clone().sub(basis.center);
            const scale = side / vertices[0].distanceTo(vertices[1]);
            return new T.Vector2(
              p.dot(basis.x) * scale,
              -p.dot(basis.y) * scale,
            );
          };
          const a = project(face, shared[0]),
            b = project(face, shared[1]);
          const toA = project(0, shared[0]),
            toB = project(0, shared[1]);
          angle =
            Math.atan2(toB.y - toA.y, toB.x - toA.x) -
            Math.atan2(b.y - a.y, b.x - a.x);
          a.rotateAround(new T.Vector2(), angle);
          cx = centerX + toA.x - a.x;
          cy = centerY + toA.y - a.y;
        }
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      const { center, x, y } = faceBases[face],
        scale = side / vertices[0].distanceTo(vertices[1]);
      ctx.beginPath();
      ctx.moveTo(0, (-h * 2) / 3);
      ctx.lineTo(-side / 2, h / 3);
      ctx.lineTo(side / 2, h / 3);
      ctx.closePath();
      ctx.fillStyle = '#11171bd9';
      ctx.fill();
      ctx.strokeStyle = '#a9ba9a40';
      ctx.stroke();
      for (const tile of TILES) {
        const mesh = model.tiles.get(tile.id)!;
        mesh.getWorldQuaternion(q);
        currentN.set(0, 0, 1).applyQuaternion(q);
        if (currentN.dot(normals[face]) < 0.42) continue;
        const pos = mesh.geometry.getAttribute('position'),
          ring = 21 * 5;
        const projected: T.Vector2[] = [];
        for (let i = 0; i < 21; i++) {
          const p = new T.Vector3()
            .fromBufferAttribute(pos, ring + i)
            .applyMatrix4(mesh.matrixWorld)
            .sub(center);
          projected.push(new T.Vector2(p.dot(x) * scale, -p.dot(y) * scale));
        }
        ctx.beginPath();
        projected.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.closePath();
        ctx.fillStyle = s.colors[tile.id];
        ctx.fill();
        const photo = textures.get(String(tile.face));
        if (s.photos[tile.face] && photo && mesh.material.map) {
          const uv = mesh.geometry.getAttribute('uv'),
            map = mesh.material.map;
          const a = new T.Vector2(uv.getX(ring), uv.getY(ring)),
            b = new T.Vector2(uv.getX(ring + 7), uv.getY(ring + 7)),
            c = new T.Vector2(uv.getX(ring + 14), uv.getY(ring + 14));
          map.updateMatrix();
          [a, b, c].forEach((p) => {
            p.applyMatrix3(map.matrix);
            p.y = 1 - p.y;
            p.set(
              p.x * photo.texture.image.width,
              p.y * photo.texture.image.height,
            );
          });
          const det = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
          if (Math.abs(det) > 0.001) {
            const p = projected[0],
              u = projected[7].clone().sub(p),
              v = projected[14].clone().sub(p);
            const xx = (u.x * (c.y - a.y) - v.x * (b.y - a.y)) / det,
              xy = (v.x * (b.x - a.x) - u.x * (c.x - a.x)) / det;
            const yx = (u.y * (c.y - a.y) - v.y * (b.y - a.y)) / det,
              yy = (v.y * (b.x - a.x) - u.y * (c.x - a.x)) / det;
            ctx.save();
            ctx.clip();
            ctx.transform(
              xx,
              yx,
              xy,
              yy,
              p.x - xx * a.x - xy * a.y,
              p.y - yx * a.x - yy * a.y,
            );
            ctx.drawImage(photo.texture.image, 0, 0);
            ctx.restore();
          }
        }
        ctx.strokeStyle = '#13191f';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
      if (!net) {
        ctx.fillStyle = '#aab4ab';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(FACE_NAMES[face], cx, cy + h / 3 + 20);
      }
    });
    ctx.restore();
  }

  return {
    updateAppearance,
    drawMaps,
    dispose() {
      textures.forEach((entry) => entry.texture.dispose());
    },
  };
}
