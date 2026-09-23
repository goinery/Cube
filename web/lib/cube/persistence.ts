import { tx } from '@/lib/i18n';
import {
  getState,
  patch,
  restoreHistory,
  setAppearance,
  subscribe,
  notify,
  defaultSettings,
  type Settings,
} from './store';
import { parseAlgorithm, apply, solved, toFaceletString } from './model';
import { QUARTER, type PartialTurns } from './interaction';
import { defaultAppearance, type Appearance } from './appearance';
import { validateKeybindings } from './keybindings';
import { validateAlgorithmPresets } from './algorithms';
export interface Project {
  version: 1;
  name: string;
  savedAt: string;
  history: string[];
  cursor: number;
  facelets: string;
  appearance: Appearance;
  settings: Settings;
  scramble: string;
  scrambleCursor: number;
  partialTurns: PartialTurns | null;
}
export function captureProject(): Project {
  const s = getState();
  return {
    version: 1,
    name: 'AXIS / 03',
    savedAt: new Date().toISOString(),
    history: s.history,
    cursor: s.cursor,
    facelets: toFaceletString(s.cube),
    appearance: s.appearance,
    settings: s.settings,
    scramble: s.scramble,
    scrambleCursor: s.scrambleCursor,
    partialTurns: s.partialTurns,
  };
}
const raster = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(v) &&
  v.length < 12000000;
function finite(v: unknown, min: number, max: number) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}
export function validateProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw new Error(tx('legacy.m445'));
  const p = value as Project;
  if (
    p.version !== 1 ||
    !Array.isArray(p.history) ||
    p.history.length > 20000 ||
    p.history.some(
      (m) => typeof m !== 'string' || parseAlgorithm(m).length !== 1,
    ) ||
    !Number.isInteger(p.cursor) ||
    p.cursor < 0 ||
    p.cursor > p.history.length
  )
    throw new Error(tx('legacy.m446'));
  const state = apply(solved(), p.history.slice(0, p.cursor));
  if (toFaceletString(state) !== p.facelets) throw new Error(tx('legacy.m447'));
  const a = defaultAppearance();
  if (!p.appearance?.stickers || !p.appearance.groups)
    throw new Error(tx('legacy.m448'));
  for (const id of Object.keys(a.stickers)) {
    const art = p.appearance.stickers[id];
    if (
      !art ||
      !/^#[a-f0-9]{6}$/i.test(art.color) ||
      !finite(art.rotation, -3600, 3600) ||
      (art.image && !raster(art.image))
    )
      throw new Error(tx('legacy.m449', { p0: id }));
    a.stickers[id] = {
      color: art.color,
      rotation: art.rotation,
      ...(art.image ? { image: art.image } : {}),
      ...(art.group ? { group: art.group } : {}),
    };
  }
  const groups = Object.entries(p.appearance.groups);
  if (groups.length > 54) throw new Error(tx('legacy.m450'));
  for (const [id, g] of groups) {
    if (
      !/^[a-z0-9-]{1,80}$/i.test(id) ||
      id !== g.id ||
      !Array.isArray(g.members) ||
      !g.members.length ||
      g.members.length > 9 ||
      new Set(g.members).size !== g.members.length ||
      new Set(g.members.map((x) => x[0])).size !== 1 ||
      g.members.some((x) => !a.stickers[x] || a.stickers[x].group !== id) ||
      !raster(g.image)
    )
      throw new Error(tx('legacy.m451'));
    if (
      !['fit', 'fill', 'crop'].includes(g.fit) ||
      !finite(g.scale, 0.1, 8) ||
      !finite(g.rotation, -3600, 3600) ||
      !finite(g.x, -2, 2) ||
      !finite(g.y, -2, 2) ||
      !finite(g.cropX, 0, 1) ||
      !finite(g.cropY, 0, 1) ||
      !finite(g.cropW, 0.05, 1) ||
      !finite(g.cropH, 0.05, 1) ||
      g.cropX + g.cropW > 1.001 ||
      g.cropY + g.cropH > 1.001
    )
      throw new Error(tx('legacy.m452'));
    if (
      g.bounds &&
      (![g.bounds.row, g.bounds.col, g.bounds.rows, g.bounds.cols].every(
        Number.isInteger,
      ) ||
        g.bounds.row < 0 ||
        g.bounds.col < 0 ||
        g.bounds.rows < 1 ||
        g.bounds.cols < 1 ||
        g.bounds.row + g.bounds.rows > 3 ||
        g.bounds.col + g.bounds.cols > 3)
    )
      throw new Error(tx('legacy.m453'));
    a.groups[id] = { ...g, members: [...g.members] };
  }
  for (const art of Object.values(a.stickers))
    if (art.group && !a.groups[art.group]) throw new Error(tx('legacy.m454'));
  const limits: Record<string, [number, number]> = {
    explode: [0, 3],
    gap: [0, 0.3],
    size: [0.65, 1.08],
    stickerOffset: [0, 0.2],
    internal: [0, 1.5],
    speed: [0.25, 3],
    roughness: [0.18, 0.65],
    magnetStrength: [0, 2],
    magnetDamping: [0.05, 2],
    turnTolerance: [0, 45],
    lightAzimuth: [-180, 180],
    lightElevation: [-80, 80],
    lightIntensity: [0, 5],
  };
  const settings = defaultSettings();
  settings.keybindings = validateKeybindings(p.settings?.keybindings);
  if (p.settings?.algorithmPresets !== undefined)
    settings.algorithmPresets = validateAlgorithmPresets(
      p.settings.algorithmPresets,
    );
  for (const [k, [min, max]] of Object.entries(limits)) {
    const v = p.settings?.[k as keyof Settings];
    if (finite(v, min, max))
      (settings as unknown as Record<string, unknown>)[k] = v;
  }
  if (['magnetic', 'smooth', 'linear'].includes(p.settings?.easing))
    settings.easing = p.settings.easing;
  if (['auto', 'high', 'low'].includes(p.settings?.quality))
    settings.quality = p.settings.quality;
  if (settings.gap === 0.045 && settings.stickerOffset === 0.012) {
    settings.gap = 0.006;
    settings.stickerOffset = 0.002;
  }
  settings.showMagnets = p.settings?.showMagnets !== false;
  settings.autoRotate = false;
  settings.lightFollowCamera = p.settings?.lightFollowCamera !== false;
  const scramble =
    typeof p.scramble === 'string' ? parseAlgorithm(p.scramble).join(' ') : '';
  let partialTurns: PartialTurns | null = null;
  if (p.partialTurns != null) {
    const held = p.partialTurns;
    if (
      ![0, 1, 2].includes(held.axis) ||
      !Array.isArray(held.angles) ||
      held.angles.length !== 3 ||
      !held.angles.every((a) => finite(a, -QUARTER / 2, QUARTER / 2))
    )
      throw new Error(tx('legacy.m455'));
    if (held.angles.some(Boolean))
      partialTurns = { axis: held.axis, angles: [...held.angles] };
  }
  return {
    version: 1,
    name: 'AXIS / 03',
    savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
    history: p.history,
    cursor: p.cursor,
    facelets: p.facelets,
    appearance: a,
    settings,
    partialTurns,
    scramble,
    scrambleCursor:
      Number.isInteger(p.scrambleCursor) && p.scrambleCursor <= p.history.length
        ? p.scrambleCursor
        : 0,
  };
}
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('axis-cube-studio', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveProject(key = 'saved') {
  const db = await openDB(),
    project = captureProject();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(project, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function readProject(key = 'saved'): Promise<Project | null> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly'),
        r = tx.objectStore('projects').get(key);
      r.onsuccess = () => resolve(r.result ? validateProject(r.result) : null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export function loadProject(p: Project) {
  if (getState().busy || getState().solving) throw new Error(tx('legacy.m456'));
  restoreHistory(p.history, p.cursor);
  setAppearance(p.appearance);
  patch({
    settings: p.settings,
    scramble: p.scramble,
    scrambleCursor: p.scrambleCursor,
    selected: [],
    partialTurns: p.partialTurns,
  });
}
export function exportProject() {
  const blob = new Blob([JSON.stringify(captureProject())], {
      type: 'application/json',
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `AXIS-03-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importProject(file: File) {
  if (file.size > 60 * 1024 * 1024) throw new Error(tx('legacy.m457'));
  const p = validateProject(JSON.parse(await file.text()));
  loadProject(p);
}
const AUTOSAVE_PREFERENCE = 'axis-cube-autosave';
export function autosavePreference() {
  try {
    return localStorage.getItem(AUTOSAVE_PREFERENCE) === 'on';
  } catch {
    return false;
  }
}
export function setAutosavePreference(on: boolean) {
  try {
    localStorage.setItem(AUTOSAVE_PREFERENCE, on ? 'on' : 'off');
  } catch {
    // 隐私模式等场景写入会被拒绝；本次会话仍按开关状态运行。
  }
}
function autosaveFailed() {
  notify(tx('legacy.m458'));
}
export function saveAutosave() {
  return saveProject('autosave').catch(autosaveFailed);
}
/** key 为 'autosave' 时取连续状态，'saved' 时取「保存」按钮留下的快照。 */
export async function restoreProject(key: 'autosave' | 'saved') {
  const s = getState();
  try {
    const p = await readProject(key);
    if (
      p &&
      getState().cursor === s.cursor &&
      getState().artVersion === s.artVersion &&
      !getState().busy
    ) {
      loadProject(p);
      // 快照里没有转动时不提示，避免在复原态下报「已恢复」。
      if (key === 'saved' && p.cursor > 0) notify(tx('legacy.m459'));
    }
  } catch {
    notify(tx('legacy.m460'));
  }
}
export function watchAutosave() {
  let timer: ReturnType<typeof setTimeout> | null = null,
    previous = getState();
  const unsub = subscribe(() => {
    const s = getState();
    if (s.busy || s.solving) return;
    if (
      s.cursor === previous.cursor &&
      s.history === previous.history &&
      s.appearance === previous.appearance &&
      s.settings === previous.settings &&
      s.partialTurns === previous.partialTurns &&
      s.scramble === previous.scramble &&
      s.scrambleCursor === previous.scrambleCursor
    )
      return;
    previous = s;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveAutosave(), 600);
  });
  return () => {
    unsub();
    if (timer) clearTimeout(timer);
  };
}
