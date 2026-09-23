import type { Definition, TileDefinition, V2 } from './types';
export interface ImageTransform {
  scale: number;
  rotation: number;
  x: number;
  y: number;
  fit: 'fill' | 'fit' | 'crop';
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
}
export interface Photo extends ImageTransform {
  id: string;
  image: string;
  members: string[];
  face: string;
  frame?: { x: number; y: number; w: number; h: number };
}
export interface TileArt {
  color: string;
  rotation: number;
  photo?: string;
}
export interface Appearance {
  tiles: Record<string, TileArt>;
  photos: Record<string, Photo>;
}
export const defaultTransform = (): ImageTransform => ({
  scale: 1,
  rotation: 0,
  x: 0,
  y: 0,
  fit: 'fill',
  cropX: 0,
  cropY: 0,
  cropW: 1,
  cropH: 1,
});
export const defaultAppearance = (def: Definition): Appearance => ({
  tiles: Object.fromEntries(
    def.tiles.map((t) => [
      t.id,
      { color: def.faces.find((f) => f.id === t.face)!.color, rotation: 0 },
    ]),
  ),
  photos: {},
});
const cache = new Map<string, Promise<HTMLImageElement>>();
export function imageFor(source: string) {
  if (!cache.has(source)) {
    const image = new Image();
    image.src = source;
    cache.set(
      source,
      image
        .decode()
        .then(() => image)
        .catch((e) => {
          cache.delete(source);
          throw e;
        }),
    );
    if (cache.size > 36) cache.delete(cache.keys().next().value!);
  }
  return cache.get(source)!;
}
export function bounds(points: V2[]) {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}
export function path(ctx: CanvasRenderingContext2D, points: V2[]) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
export function drawPhoto(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  photo: ImageTransform,
  rect: ReturnType<typeof bounds>,
) {
  const sw = photo.cropW * image.width,
    sh = photo.cropH * image.height;
  const factor =
    (photo.fit === 'fit'
      ? Math.min(rect.w / sw, rect.h / sh)
      : Math.max(rect.w / sw, rect.h / sh)) * photo.scale;
  ctx.translate(
    rect.x + rect.w / 2 + photo.x * rect.w,
    rect.y + rect.h / 2 - photo.y * rect.h,
  );
  ctx.rotate((-photo.rotation * Math.PI) / 180);
  ctx.scale(1, -1);
  ctx.drawImage(
    image,
    photo.cropX * image.width,
    photo.cropY * image.height,
    sw,
    sh,
    (-sw * factor) / 2,
    (-sh * factor) / 2,
    sw * factor,
    sh * factor,
  );
}
export async function paintFace(
  canvas: HTMLCanvasElement,
  def: Definition,
  faceId: string,
  appearance: Appearance,
  selected: string[] = [],
  resolution = 720,
) {
  const face = def.faces.find((f) => f.id === faceId)!,
    rect = bounds(face.outline),
    tiles = def.tiles.filter((t) => t.face === faceId);
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    Object.values(appearance.photos)
      .filter((p) => p.face === faceId)
      .map(async (p) => images.set(p.id, await imageFor(p.image))),
  );
  canvas.width = resolution;
  canvas.height = Math.round((resolution * rect.h) / rect.w);
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(
    resolution / rect.w,
    0,
    0,
    -resolution / rect.w,
    (-rect.x * resolution) / rect.w,
    ((rect.y + rect.h) * resolution) / rect.w,
  );
  path(ctx, face.outline);
  ctx.fillStyle = '#101214';
  ctx.fill();
  for (const tile of tiles) {
    const art = appearance.tiles[tile.id];
    ctx.save();
    path(ctx, tile.outline);
    ctx.clip();
    ctx.fillStyle = art.color;
    ctx.fill();
    const photo = art.photo ? appearance.photos[art.photo] : undefined;
    if (photo && images.has(photo.id)) {
      ctx.translate(...tile.center);
      ctx.rotate((-art.rotation * Math.PI) / 180);
      ctx.translate(-tile.center[0], -tile.center[1]);
      drawPhoto(ctx, images.get(photo.id)!, photo, photoBounds(def, photo));
    }
    ctx.restore();
    if (selected.includes(tile.id)) {
      path(ctx, tile.outline);
      ctx.strokeStyle = '#e7fac3';
      ctx.lineWidth = (rect.w / resolution) * 2;
      ctx.setLineDash([rect.w * 0.02, rect.w * 0.01]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
export function photoBounds(def: Definition, photo: Photo) {
  return (
    photo.frame ??
    bounds(
      def.tiles
        .filter((t) => photo.members.includes(t.id))
        .flatMap((t) => t.outline),
    )
  );
}
export function separatePhoto(
  def: Definition,
  appearance: Appearance,
  id: string,
) {
  const next = structuredClone(appearance),
    photo = next.photos[id];
  if (!photo) return next;
  const frame = photoBounds(def, photo);
  delete next.photos[id];
  for (const member of photo.members) {
    const key = crypto.randomUUID();
    next.photos[key] = { ...photo, id: key, members: [member], frame };
    next.tiles[member].photo = key;
  }
  return next;
}
export function applyPhoto(appearance: Appearance, photo: Photo): Appearance {
  const next = structuredClone(appearance);
  for (const old of Object.values(next.photos)) {
    if (old.id === photo.id) continue;
    old.members = old.members.filter((id) => !photo.members.includes(id));
    if (!old.members.length) delete next.photos[old.id];
  }
  next.photos[photo.id] = photo;
  for (const id of photo.members)
    next.tiles[id] = { ...next.tiles[id], photo: photo.id };
  return next;
}
export async function importImage(file: File) {
  if (file.size > 25 * 1024 * 1024) throw new Error('art.tooLarge');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('art.failed');
  const url = URL.createObjectURL(file);
  try {
    const img = await imageFor(url),
      canvas = document.createElement('canvas'),
      scale = Math.min(1, 2048 / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.94);
  } finally {
    cache.delete(url);
    URL.revokeObjectURL(url);
  }
}
export function hitTile(
  def: Definition,
  faceId: string,
  x: number,
  y: number,
): TileDefinition | undefined {
  return def.tiles.find(
    (tile) => tile.face === faceId && inside(tile.outline, x, y),
  );
}
function inside(points: V2[], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
