import { validatePresets } from './presets';
import { tx } from '@/lib/i18n';
import type { PuzzleSettings as Settings } from '@/puzzles/config';
import { watchAutosave as watch,sameFields } from '@/lib/workspace/autosave';
import { validateBindings } from '@/lib/workspace/keybindings';
import { getState,subscribe,patch,notify,pause,interruptSettling,defaultColors,defaultKeys,defaultPresets,defaultPyraminxSettings,type State,type Preset,type PartialTurn } from './store';
import { apply,solved,parseMove,TURN } from './model';
import { sameLayer,turnsConflict } from './interaction';
export interface Project {
  version: 1;
  puzzle: 'pyraminx';
  history: string[];
  cursor: number;
  partials: PartialTurn[];
  colors: State['colors'];
  photos: State['photos'];
  settings: Settings;
  presets: Preset[];
  keybindings: Record<string, string>;
}
export function captureProject(): Project {
  const {
    history,
    cursor,
    partials,
    colors,
    photos,
    settings,
    presets,
    keybindings,
  } = getState();
  return {
    version: 1,
    puzzle: 'pyraminx',
    history,
    cursor,
    partials,
    colors,
    photos,
    settings,
    presets,
    keybindings,
  };
}
const finite = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export function validateProject(value: unknown): Project {
  const p = value as Project;
  if (!p || p.version !== 1 || p.puzzle !== 'pyraminx')
    throw new Error(tx('legacy.m517'));
  if (
    !Array.isArray(p.history) ||
    p.history.length > 20000 ||
    !Number.isInteger(p.cursor) ||
    p.cursor < 0 ||
    p.cursor > p.history.length
  )
    throw new Error(tx('legacy.m518'));
  p.history.forEach((m) => {
    if (typeof m !== 'string') throw new Error(tx('legacy.m519'));
    parseMove(m);
  });
  // Read older saved projects that had room for only one unfinished layer.
  const legacy = (
    p as Project & {
      partial?: PartialTurn | null;
    }
  ).partial;
  const partials = p.partials ?? (legacy ? [legacy] : []);
  if (
    !Array.isArray(partials) ||
    partials.length > 7 ||
    partials.some(
      (partial, index) =>
        !partial ||
        !Number.isInteger(partial.axis) ||
        !finite(partial.axis, 0, 3) ||
        !['tip', 'body', 'base'].includes(partial.layer) ||
        !finite(partial.angle, -TURN / 2, TURN / 2) ||
        partials
          .slice(0, index)
          .some(
            (other) =>
              sameLayer(other, partial) || turnsConflict(other, partial),
          ),
    )
  )
    throw new Error(tx('legacy.m520'));
  const colors = defaultColors();
  for (const id of Object.keys(colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(p.colors?.[id]))
      throw new Error(tx('legacy.m521'));
    colors[id] = p.colors[id];
  }
  const photos: State['photos'] = {};
  for (const [face, photo] of Object.entries(p.photos || {})) {
    if (
      !/^[0-3]$/.test(face) ||
      typeof photo?.src !== 'string' ||
      photo.src.length > 12000000 ||
      !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(photo.src) ||
      !finite(photo.scale, 0.1, 8) ||
      !finite(photo.x, -2, 2) ||
      !finite(photo.y, -2, 2) ||
      !finite(photo.rotation, -360, 360)
    )
      throw new Error(tx('legacy.m522'));
    photos[face] = { ...photo };
  }
  const settings = defaultPyraminxSettings();
  const ranges: Partial<Record<keyof Settings, [number, number]>> = {
    explode: [0, 3],
    gap: [0, 0.3],
    size: [0.65, 1.08],
    internal: [0, 1.5],
    stickerOffset: [0, 0.2],
    speed: [0.2, 3],
    roughness: [0.05, 1],
    magnetStrength: [0, 2],
    magnetDamping: [0.05, 2],
    turnTolerance: [0, 120],
    lightAzimuth: [-180, 180],
    lightElevation: [-10, 90],
    lightIntensity: [0, 6],
  };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const v = p.settings?.[key as keyof Settings];
    if (v === undefined) continue;
    if (!finite(v, min, max)) throw new Error(tx('legacy.m523', { p0: key }));
    Object.assign(settings, { [key]: v });
  }
  settings.turnTolerance = Math.min(60, settings.turnTolerance);
  for (const key of [
    'minimal',
    'autoRotate',
    'lightFollowCamera',
    'showMagnets',
  ] as const)
    if (typeof p.settings?.[key] === 'boolean') settings[key] = p.settings[key];
  if (['auto', 'high', 'low'].includes(p.settings?.quality))
    settings.quality = p.settings.quality;
  if (['smooth', 'magnetic', 'linear'].includes(p.settings?.easing))
    settings.easing = p.settings.easing;
  const presets = validatePresets(p.presets ?? defaultPresets());
  const keybindings = validateBindings(p.keybindings, defaultKeys());
  return {
    version: 1,
    puzzle: 'pyraminx',
    history: [...p.history],
    cursor: p.cursor,
    partials: partials.map((p) => ({ ...p })),
    colors,
    photos,
    settings,
    presets,
    keybindings,
  };
}
export function importProject(value: unknown) {
  interruptSettling();
  if (getState().busy || getState().solving) return;
  const p = validateProject(value);
  pause();
  patch({
    ...p,
    puzzle: apply(solved(), p.history.slice(0, p.cursor)),
    player: null,
    selected: [],
    scramble: '',
  });
}
const KEY = 'axis-pyraminx-v1';
let restored = false;
export function restoreLocal() {
  if (restored) return;
  restored = true;
  try {
    const autoSave = localStorage.getItem(`${KEY}-auto`) === 'true';
    const raw = localStorage.getItem(
      `${KEY}-${autoSave ? 'autosave' : 'saved'}`,
    );
    if (raw) importProject(JSON.parse(raw));
    patch({ autoSave });
  } catch {
    notify(tx('legacy.m527'));
  }
}
export function saveLocal(auto = false) {
  try {
    localStorage.setItem(
      `${KEY}-${auto ? 'autosave' : 'saved'}`,
      JSON.stringify(captureProject()),
    );
    if (!auto) notify(tx('legacy.m528'));
    return true;
  } catch {
    notify(tx('legacy.m529'));
    return false;
  }
}
export function setAutoSave(on: boolean) {
  try {
    localStorage.setItem(`${KEY}-auto`, String(on));
    patch({ autoSave: on });
    if (on) saveLocal(true);
  } catch {
    notify(tx('legacy.m530'));
  }
}
export function watchAutosave() {
  return watch({
    read: getState, subscribe,
    equal: (a, b) => sameFields(a, b, ['history', 'cursor', 'partials', 'colors', 'photos', 'settings', 'presets', 'keybindings']),
    enabled: () => getState().autoSave,
    ready: () => !getState().busy && !getState().solving,
    save: () => saveLocal(true),
    onError: () => notify(tx('legacy.m529')),
  });
}
