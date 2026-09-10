import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Sticker } from './model';

/** Radii in top-left, top-right, bottom-right, bottom-left order. */
export function tileRadii(row: number, col: number): number[] {
  if (row === 1 && col === 1) return [0.29, 0.29, 0.29, 0.29];
  const small = 0.035,
    large = 0.31;
  if (row === 0 && col === 1) return [small, small, large, large];
  if (row === 2 && col === 1) return [large, large, small, small];
  if (row === 1 && col === 0) return [small, large, large, small];
  if (row === 1 && col === 2) return [large, small, small, large];
  return [small, small, small, small];
}

/** Weld the duplicated extrusion vertices so bevels share continuous normals. */
export function smoothBevels(geometry: BufferGeometry) {
  geometry.deleteAttribute('normal');
  const smooth = mergeVertices(geometry, 0.00001);
  smooth.computeVertexNormals();
  geometry.dispose();
  return smooth;
}

export function createTileGeometry(sticker: Pick<Sticker, 'row' | 'col'>) {
  const [tl, tr, br, bl] = tileRadii(sticker.row, sticker.col);
  const h = 0.484,
    shape = new Shape();
  // Broad inner corners on edge caps meet the rounded center; outer corners stay square.
  shape.moveTo(-h + bl, -h);
  shape.lineTo(h - br, -h);
  shape.quadraticCurveTo(h, -h, h, -h + br);
  shape.lineTo(h, h - tr);
  shape.quadraticCurveTo(h, h, h - tr, h);
  shape.lineTo(-h + tl, h);
  shape.quadraticCurveTo(-h, h, -h, h - tl);
  shape.lineTo(-h, -h + bl);
  shape.quadraticCurveTo(-h, -h, -h + bl, -h);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.072,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.014,
    bevelSegments: 5,
    curveSegments: 20,
    steps: 1,
  });
  geometry.translate(0, 0, -0.036);
  const positions = geometry.getAttribute('position'),
    uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++)
    uv.setXY(
      i,
      positions.getX(i) / 0.996 + 0.5,
      positions.getY(i) / 0.996 + 0.5,
    );
  const smooth = smoothBevels(geometry);
  const positionsSmooth = smooth.getAttribute('position');
  const colors = new Float32Array(positionsSmooth.count * 3);
  for (let i = 0; i < positionsSmooth.count; i++) {
    // The face retains the exact chosen color; the recessed rim has more depth.
    const depth = Math.max(
      0,
      Math.min(1, (positionsSmooth.getZ(i) + 0.036) / 0.072),
    );
    const shade = 0.86 + 0.14 * depth * depth * (3 - 2 * depth);
    colors.set([shade, shade, shade], i * 3);
  }
  smooth.setAttribute('color', new Float32BufferAttribute(colors, 3));
  smooth.computeBoundingBox();
  return smooth;
}
