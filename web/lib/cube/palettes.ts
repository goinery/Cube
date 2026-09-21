import { COLORS, FACES } from './model';

// Both puzzles use the same face colours for their previews and materials.
export const PALETTES = [
  { name: '原厂', colors: COLORS },
  {
    name: '霓虹',
    colors: Object.fromEntries(
      FACES.map((face, i) => [face, ['#ffffff', '#ff1744', '#00e676', '#ffea00', '#aa00ff', '#0091ff'][i]]),
    ) as typeof COLORS,
  },
  {
    name: '撞色',
    colors: Object.fromEntries(
      FACES.map((face, i) => [face, ['#fff4cf', '#e6007e', '#00c9d4', '#ffe000', '#ff6500', '#253acb'][i]]),
    ) as typeof COLORS,
  },
];
