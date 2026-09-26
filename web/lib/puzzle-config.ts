export type StudioPuzzleId =
  | 'cube'
  | 'cube-2'
  | 'cube-4'
  | 'cube-5'
  | 'megaminx'
  | 'pyraminx';
export type Quality = 'auto' | 'high' | 'low';
export type Vector = readonly [number, number, number];

export interface PuzzleSettings {
  explode: number;
  gap: number;
  size: number;
  stickerOffset: number;
  internal: number;
  speed: number;
  easing: 'smooth' | 'magnetic' | 'linear';
  roughness: number;
  autoRotate: boolean;
  lightFollowCamera: boolean;
  lightAzimuth: number;
  lightElevation: number;
  lightIntensity: number;
  quality: Quality;
  minimal: boolean;
  showMagnets: boolean;
  magnetStrength: number;
  magnetDamping: number;
  turnTolerance: number;
}

export interface CameraDefaults {
  direction: Vector;
  up: Vector;
  target: Vector;
  face?: string;
  horizontalBottomEdge?: boolean;
  initialRollDegrees?: number;
  fov: number;
  near: number;
  far: number;
  distance: number;
  occupancy: number;
  fitOccupancy: number;
  autoRotateSpeed: number;
}

export const STUDIO_DEFAULTS = {
  activePuzzle: 'cube' as StudioPuzzleId,
  mode: 'play' as const,
  view: 'hidden' as const,
  autoSave: false,
  presentation: false,
  exposure: 0.78,
  environment: { intensity: 0.5, blur: 0.035 },
  hemisphere: { sky: 0xf2f4f7, ground: 0x17191d, intensity: 0.4 },
  key: {
    color: 0xfff3e6,
    intensity: 2.8,
    position: [-3, 7, 5] as Vector,
    azimuth: -31,
    elevation: 50,
    distance: 30,
  },
  fill: { color: 0xfffbf5, intensity: 1.2, position: [6, 1, 5] as Vector },
  rim: { color: 0xd6e5ff, intensity: 1.15, position: [4, 3, -5] as Vector },
  shadow: { normalBias: 0.008, bias: -0.00008, radius: 2.5, lowRadius: 1.5 },
  ground: { color: '#101720', opacity: 0.1 },
  pixelRatio: { low: 1, high: 2, mobile: 1.5, desktop: 2 },
  mobileWidth: 760,
  frame: { initialDelta: 1 / 60, maxDelta: 0.05 },
} as const;

const settings: Readonly<PuzzleSettings> = {
  explode: 0,
  gap: 0.008,
  size: 1,
  stickerOffset: 0,
  internal: 1,
  speed: 1,
  easing: 'magnetic',
  roughness: 0.24,
  autoRotate: false,
  lightFollowCamera: true,
  lightAzimuth: STUDIO_DEFAULTS.key.azimuth,
  lightElevation: STUDIO_DEFAULTS.key.elevation,
  lightIntensity: STUDIO_DEFAULTS.key.intensity,
  quality: 'auto',
  minimal: false,
  showMagnets: true,
  magnetStrength: 1,
  magnetDamping: 0.7,
  turnTolerance: 45,
};
const camera: CameraDefaults = {
  direction: [1, 0.65, 1],
  up: [0, 1, 0],
  target: [0, 0, 0],
  fov: 30,
  near: 0.01,
  far: 100,
  distance: 9.5,
  occupancy: 0.68,
  fitOccupancy: 0.75,
  autoRotateSpeed: 0.22,
};
const render = {
  shadows: true,
  shadowExtent: 8,
  shadowResolution: 1024,
  mobileShadowResolution: 1024,
  lowShadowResolution: 512,
  shadowRadius: 1,
  groundSize: 80,
  groundY: -1.57,
  contactSize: 5,
  contactOpacity: 0.55,
  occlusion: 'coverage' as 'coverage' | 'hybrid',
};
export const PUZZLE_DEFAULTS = {
  cube: {
    settings: { ...settings, gap: 0.006 },
    camera: {
      ...camera,
      near: 0.005,
      far: 200,
      distance: 10,
      autoRotateSpeed: 0.12,
    },
    render: {
      ...render,
      shadowExtent: 9,
      shadowResolution: 2048,
      shadowRadius: STUDIO_DEFAULTS.shadow.radius,
      groundSize: 100,
      groundY: -1.65,
      contactSize: 1,
      occlusion: 'hybrid' as const,
    },
    editFace: 'F' as const,
  },
  'cube-2': {
    settings: { ...settings },
    camera: { ...camera },
    render: { ...render },
    editFace: 'F',
  },
  'cube-4': {
    settings: { ...settings },
    camera: { ...camera },
    render: { ...render },
    editFace: 'F',
  },
  'cube-5': {
    settings: { ...settings },
    camera: { ...camera },
    render: { ...render },
    editFace: 'F',
  },
  megaminx: {
    settings: { ...settings, turnTolerance: 36 },
    camera: {
      ...camera,
      distance: 10.4,
      face: 'FL',
      horizontalBottomEdge: true,
      initialRollDegrees: 2,
    },
    render: { ...render, groundY: -1.98 },
    editFace: 'FL',
  },
  pyraminx: {
    settings: { ...settings, gap: 0, turnTolerance: 60 },
    camera: {
      ...camera,
      direction: [0, 1, 0] as Vector,
      up: [-Math.sqrt(3), 0, 1] as Vector,
      target: [0, 0.15, 0] as Vector,
      fov: 31,
      distance: 10,
      occupancy: 0.7,
      fitOccupancy: 0.7,
      autoRotateSpeed: 0.18,
    },
    render: {
      ...render,
      shadows: false,
      groundY: -0.89,
      contactSize: 8,
      contactOpacity: 0.22,
      occlusion: 'hybrid' as const,
    },
    editFace: 3,
  },
} satisfies Record<
  StudioPuzzleId,
  {
    settings: PuzzleSettings;
    camera: CameraDefaults;
    render: typeof render;
    editFace: string | number;
  }
>;

// Each session owns a fresh settings object; changing one puzzle must not alter another.
export function createPuzzleSettings(id: StudioPuzzleId): PuzzleSettings {
  return { ...PUZZLE_DEFAULTS[id].settings };
}

export function assemblyDefaults(id: StudioPuzzleId) {
  const { explode, gap, size, internal, stickerOffset } =
    PUZZLE_DEFAULTS[id].settings;
  return { explode, gap, size, internal, stickerOffset };
}

export const CUBE_COLORS = {
  U: '#f2f3f5',
  R: '#ed211a',
  F: '#08a665',
  D: '#ffd52b',
  L: '#ff851c',
  B: '#0767eb',
};
export const MEGAMINX_COLORS: Record<string, string> = {
  F: '#909397',
  U: '#f3ed54',
  R: '#ec629e',
  L: '#32b8ed',
  DR: '#70ce30',
  DL: '#ff8619',
  BR: '#8126be',
  BL: '#ffffff',
  FR: '#115de1',
  FL: '#ef2921',
  D: '#006c49',
  B: '#d1b999',
};
export const GENERAL_KEYS = {
  undo: 'Mod+KeyZ',
  redo: 'Mod+Shift+KeyZ',
  playPause: 'Space',
  exitPresentation: 'Escape',
};
export const DEFAULT_PRESETS = {
  cube: [
    {
      labelKey: 'legacy.m408',
      algorithm: "F D2 L2 B D B' F2 U' F U F2 U2 F' L D F' U",
    },
    {
      labelKey: 'legacy.m409',
      algorithm: "U2 L2 F2 U' B2 D R F' R F' R F' D' B2 U'",
    },
  ],
  pyraminx: [
    { labelKey: 'legacy.m506', algorithm: "R U R' U R U R' U" },
    { labelKey: 'legacy.m507', algorithm: "L R' L' R U R U' R'" },
    { labelKey: 'legacy.m508', algorithm: 'u l r b' },
    { labelKey: 'legacy.m509', algorithm: "Uw Rw' Bw Lw'" },
  ],
  workspace: [
    { id: 'trigger', labelKey: 'algorithm.trigger', algorithm: "R U R' U'" },
    { id: 'reverse', labelKey: 'algorithm.reverse', algorithm: "L' U' L U" },
  ],
  pattern: {
    'cube-2': { labelKey: 'algorithm.checker', algorithm: 'R2 U2 F2' },
    'cube-4': { labelKey: 'algorithm.checker', algorithm: '2R2 2U2 2F2' },
    'cube-5': { labelKey: 'algorithm.checker', algorithm: '2R2 2U2 2F2' },
    megaminx: { labelKey: 'algorithm.cycle', algorithm: 'U R F L BL' },
  },
};
