import type { Photo } from './store';

export const FACE_HEIGHT_RATIO = Math.sqrt(3) / 2;

export function paintPhoto(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  photo: Photo,
) {
  canvas.width = 512;
  canvas.height = Math.round(canvas.width * FACE_HEIGHT_RATIO);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cover = Math.max(
    canvas.width / image.width,
    canvas.height / image.height,
  );
  ctx.translate(
    canvas.width * (0.5 + photo.x),
    canvas.height * (0.5 + photo.y),
  );
  ctx.rotate((photo.rotation * Math.PI) / 180);
  ctx.scale(photo.scale, photo.scale);
  ctx.drawImage(
    image,
    (-image.width * cover) / 2,
    (-image.height * cover) / 2,
    image.width * cover,
    image.height * cover,
  );
}
