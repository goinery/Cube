import { tx } from '@/lib/i18n';
export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const IMAGE_MAX_EDGE = 1600;
export async function importImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error(tx('art.failed'));
  if (file.size > IMAGE_MAX_BYTES) throw new Error(tx('art.tooLarge'));
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error(tx('art.failed'));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.92);
  } finally { URL.revokeObjectURL(url); }
}
export interface ImageTransform { scale: number; x: number; y: number; rotation: number }
