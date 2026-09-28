import { CUBE_COLORS } from '../config';
import { CAP_INSET } from '@/lib/rendering/cap-seams';
import { vec, tuple, rotationGroup, roundedPolygon } from '../engine/math';
import type { Definition, FaceDefinition, PieceDefinition, PuzzleId, TileDefinition, V2, V3 } from '../engine/types';

const cubeFaces: [string, V3, V3, V3, string][] = [
  ['U', [0, 1, 0], [1, 0, 0], [0, 0, -1], CUBE_COLORS.U],
  ['R', [1, 0, 0], [0, 0, -1], [0, 1, 0], CUBE_COLORS.R],
  ['F', [0, 0, 1], [1, 0, 0], [0, 1, 0], CUBE_COLORS.F],
  ['D', [0, -1, 0], [1, 0, 0], [0, 0, 1], CUBE_COLORS.D],
  ['L', [-1, 0, 0], [0, 0, 1], [0, 1, 0], CUBE_COLORS.L],
  ['B', [0, 0, -1], [-1, 0, 0], [0, 1, 0], CUBE_COLORS.B],
];
export function cubeDefinition(order: number): Definition {
  const widths =
    order === 4
      ? [0.78, 0.72, 0.72, 0.78]
      : order === 5
        ? [0.66, 0.56, 0.56, 0.56, 0.66]
        : [1.5, 1.5];
  const boundaries = [-1.5];
  widths.forEach((width) => boundaries.push(boundaries.at(-1)! + width));
  const centers = widths.map((width, i) => boundaries[i] + width / 2);
  const faces: FaceDefinition[] = cubeFaces.map(
    ([id, normal, right, up, color]) => ({
      id,
      normal,
      right,
      up,
      color,
      center: tuple(vec(normal).multiplyScalar(1.5)),
      outline: [
        [-1.5, -1.5],
        [1.5, -1.5],
        [1.5, 1.5],
        [-1.5, 1.5],
      ],
    }),
  );
  const pieces: PieceDefinition[] = [],
    tiles: TileDefinition[] = [];
  for (let x = 0; x < order; x++)
    for (let y = 0; y < order; y++)
      for (let z = 0; z < order; z++) {
        const index = [x, y, z],
          outside = index.filter((i) => i === 0 || i === order - 1).length;
        if (!outside) continue;
        const anchor = index.map((i) => i * 2 - order + 1) as V3;
        const kind =
          outside === 3
            ? 'corner'
            : outside === 2
              ? anchor.includes(0)
                ? 'edge'
                : 'wing'
              : order === 5
                ? anchor.filter(Boolean).length === 1
                  ? 'center'
                  : anchor.includes(0)
                    ? 't-center'
                    : 'x-center'
                : 'center';
        const piece: PieceDefinition = {
          id: index.join(','),
          kind,
          anchor,
          home: index.map((i) => centers[i]) as V3,
          tiles: [],
        };
        const pi = pieces.length;
        pieces.push(piece);
        for (const face of faces) {
          const axis = face.normal.findIndex(Boolean),
            sign = face.normal[axis];
          if (index[axis] !== (sign > 0 ? order - 1 : 0)) continue;
          const rx = face.right.findIndex(Boolean),
            uy = face.up.findIndex(Boolean);
          const cx = piece.home[rx] * face.right[rx],
            cy = piece.home[uy] * face.up[uy];
          const w = widths[index[rx]],
            h = widths[index[uy]],
            gap = CAP_INSET;
          const corners: V2[] = [
            [cx - w / 2 + gap, cy - h / 2 + gap],
            [cx + w / 2 - gap, cy - h / 2 + gap],
            [cx + w / 2 - gap, cy + h / 2 - gap],
            [cx - w / 2 + gap, cy + h / 2 - gap],
          ];
          const radii = corners.map(([px, py]) => {
            if (order === 2)
              return Math.abs(px) < 0.1 && Math.abs(py) < 0.1 ? 0.32 : 0.035;
            const outerX = Math.abs(px) > 1.45,
              outerY = Math.abs(py) > 1.45;
            if (outerX || outerY) return 0.045;
            const nearOuter = Math.abs(px) > 0.75 || Math.abs(py) > 0.75;
            return nearOuter ? 0.24 : 0.16;
          });
          const id = `${face.id}:${Math.round((order - 1 - vec(anchor).dot(vec(face.up))) / 2)}:${Math.round((vec(anchor).dot(vec(face.right)) + order - 1) / 2)}`;
          tiles.push({
            id,
            face: face.id,
            piece: pi,
            center: [cx, cy],
            outline: roundedPolygon(corners, radii),
          });
          piece.tiles.push(id);
        }
      }
  return {
    id: `cube-${order}` as PuzzleId,
    order,
    step: Math.PI / 2,
    faces,
    pieces,
    tiles,
    group: rotationGroup(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      Math.PI / 2,
    ),
    primitiveMoves: ['R', 'U', 'F'].flatMap((f) =>
      Array.from({ length: order }, (_, i) => (i ? `${i + 1}${f}` : f)),
    ),
  };
}
