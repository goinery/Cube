import { apply, moveSpec, parseAlgorithm, solved } from './model';
import { defaultAppearance, type Appearance, type Photo } from './appearance';
import {
  defaultKeys,
  defaultSettings,
  type Preset,
  type Session,
} from './session';
import type { PuzzleId, PuzzleState } from './types';
import type { TurnCoordinator } from './motion';

export interface Project {
  schemaVersion: 2;
  puzzleId: PuzzleId;
  definitionVersion: 1;
  savedAt: string;
  state: PuzzleState;
  history: string[];
  cursor: number;
  appearance: Appearance;
  settings: Session['state']['settings'];
  keys: Record<string, string>;
  presets: Preset[];
  residuals: ReturnType<TurnCoordinator['capture']>;
  scramble: string;
  scrambleState?: Session['state']['scrambleState'];
}
export function capture(session: Session): Project {
  const s = session.state;
  return {
    schemaVersion: 2,
    puzzleId: session.def.id,
    definitionVersion: 1,
    savedAt: new Date().toISOString(),
    state: structuredClone(s.puzzle),
    history: s.history,
    cursor: s.cursor,
    appearance: s.appearance,
    settings: s.settings,
    keys: s.keys,
    presets: s.presets,
    residuals: session.motion.capture(),
    scramble: s.scramble,
    scrambleState: s.scrambleState,
  };
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('axis-puzzle-studio', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('projects'))
        request.result.createObjectStore('projects');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function write(key: string, value: Project) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('projects', 'readwrite');
      transaction.objectStore('projects').put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
export async function save(session: Session, auto = false) {
  await write(`${session.def.id}:${auto ? 'auto' : 'saved'}`, capture(session));
  if (!auto) session.notify('project.saved');
}
export async function read(session: Session, auto = false) {
  const db = await database();
  try {
    return await new Promise<Project | undefined>((resolve, reject) => {
      const request = db
        .transaction('projects')
        .objectStore('projects')
        .get(`${session.def.id}:${auto ? 'auto' : 'saved'}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
const finite = (x: unknown, min: number, max: number) =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const image = (s: unknown) =>
  typeof s === 'string' &&
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) &&
  s.length < 12_000_000;
export function validate(session: Session, value: unknown): Project {
  const fail = (): never => {
    throw new Error('project.invalid');
  };
  if (!value || typeof value !== 'object') return fail();
  const p = value as Project,
    def = session.def;
  if (
    p.schemaVersion !== 2 ||
    p.definitionVersion !== 1 ||
    p.puzzleId !== def.id ||
    !Array.isArray(p.history) ||
    p.history.length > 200000 ||
    !Number.isInteger(p.cursor) ||
    p.cursor < 0 ||
    p.cursor > p.history.length
  )
    return fail();
  for (const token of p.history)
    if (typeof token !== 'string' || parseAlgorithm(def, token).length !== 1)
      return fail();
  const expected = apply(def, solved(def), p.history.slice(0, p.cursor));
  if (
    !p.state ||
    !Array.isArray(p.state.rotations) ||
    JSON.stringify(expected.rotations) !== JSON.stringify(p.state.rotations)
  )
    return fail();
  if (p.scrambleState) {
    const snapshot = p.scrambleState;
    if (
      !Array.isArray(snapshot.history) ||
      snapshot.history.length > 200000 ||
      !Number.isInteger(snapshot.cursor) ||
      snapshot.cursor < 0 ||
      snapshot.cursor > snapshot.history.length ||
      snapshot.history.some(
        (token) =>
          typeof token !== 'string' || parseAlgorithm(def, token).length !== 1,
      ) ||
      JSON.stringify(
        apply(def, solved(def), snapshot.history.slice(0, snapshot.cursor))
          .rotations,
      ) !== JSON.stringify(snapshot.puzzle?.rotations)
    )
      return fail();
  }
  const appearance = defaultAppearance(def);
  if (
    !p.appearance?.tiles ||
    !p.appearance.photos ||
    typeof p.appearance.photos !== 'object' ||
    Array.isArray(p.appearance.photos)
  )
    return fail();
  for (const tile of def.tiles) {
    const a = p.appearance.tiles[tile.id];
    if (
      !a ||
      !/^#[a-f\d]{6}$/i.test(a.color) ||
      !finite(a.rotation, -3600, 3600)
    )
      return fail();
    appearance.tiles[tile.id] = {
      color: a.color,
      rotation: a.rotation,
      ...(typeof a.photo === 'string' ? { photo: a.photo } : {}),
    };
  }
  if (Object.keys(p.appearance.photos).length > def.tiles.length) return fail();
  for (const [id, g] of Object.entries(p.appearance.photos)) {
    if (
      !/^[\w-]{1,80}$/.test(id) ||
      id !== g.id ||
      !image(g.image) ||
      !Array.isArray(g.members) ||
      !g.members.length ||
      new Set(g.members).size !== g.members.length ||
      g.members.some(
        (id) => !def.tiles.some((t) => t.id === id && t.face === g.face),
      ) ||
      !['fill', 'fit', 'crop'].includes(g.fit)
    )
      return fail();
    if (
      !finite(g.scale, 0.1, 8) ||
      !finite(g.rotation, -3600, 3600) ||
      !finite(g.x, -2, 2) ||
      !finite(g.y, -2, 2) ||
      !finite(g.cropX, 0, 1) ||
      !finite(g.cropY, 0, 1) ||
      !finite(g.cropW, 0.01, 1) ||
      !finite(g.cropH, 0.01, 1) ||
      g.cropX + g.cropW > 1.00001 ||
      g.cropY + g.cropH > 1.00001
    )
      return fail();
    if (
      g.frame &&
      (!finite(g.frame.x, -20, 20) ||
        !finite(g.frame.y, -20, 20) ||
        !finite(g.frame.w, 0.001, 40) ||
        !finite(g.frame.h, 0.001, 40))
    )
      return fail();
    appearance.photos[id] = structuredClone(g);
  }
  for (const [id, art] of Object.entries(appearance.tiles))
    if (art.photo && !appearance.photos[art.photo]?.members.includes(id))
      return fail();
  const settings = defaultSettings(def),
    ranges: Record<string, [number, number]> = {
      magnetStrength: [0, 2],
      magnetDamping: [0.05, 2],
      turnTolerance: [0, (def.step * 90) / Math.PI],
      speed: [0.2, 4],
      explode: [0, 3],
      internal: [0, 3],
      gap: [0, 0.2],
      size: [0.65, 1.2],
      stickerOffset: [0, 0.4],
      roughness: [0.05, 0.9],
      lightAzimuth: [-180, 180],
      lightElevation: [-90, 90],
      lightIntensity: [0, 6],
    };
  if (!p.settings || typeof p.settings !== 'object') return fail();
  for (const [key, range] of Object.entries(ranges)) {
    const value = p.settings[key as keyof typeof settings];
    if (!finite(value, ...range)) return fail();
    Object.assign(settings, { [key]: value });
  }
  for (const key of ['showMagnets', 'autoRotate', 'lightFollowCamera'] as const)
    if (typeof p.settings[key] === 'boolean') settings[key] = p.settings[key];
    else return fail();
  if (
    !['auto', 'high', 'low'].includes(p.settings.quality) ||
    !['smooth', 'magnetic', 'linear'].includes(p.settings.easing)
  )
    return fail();
  settings.quality = p.settings.quality;
  settings.easing = p.settings.easing;
  const keys = defaultKeys(def);
  if (p.keys && typeof p.keys === 'object')
    for (const [key, value] of Object.entries(p.keys)) {
      if (typeof value !== 'string' || value.length > 80) return fail();
      if (!['undo', 'redo', 'playPause', 'exitPresentation'].includes(key))
        parseAlgorithm(def, key);
      keys[key] = value;
    }
  if (!Array.isArray(p.presets) || p.presets.length > 200) return fail();
  for (const preset of p.presets) {
    if (
      typeof preset.id !== 'string' ||
      typeof preset.name !== 'string' ||
      preset.name.length > 100 ||
      typeof preset.algorithm !== 'string'
    )
      return fail();
    parseAlgorithm(def, preset.algorithm);
  }
  if (!Array.isArray(p.residuals) || p.residuals.length > 100) return fail();
  for (const r of p.residuals) {
    if (
      typeof r.key !== 'string' ||
      parseAlgorithm(def, r.key).length !== 1 ||
      !Array.isArray(r.axis) ||
      r.axis.length !== 3 ||
      r.axis.some((x) => !finite(x, -1, 1)) ||
      Math.abs(Math.hypot(...r.axis) - 1) > 1e-5 ||
      !finite(r.angle, -Math.PI * 2, Math.PI * 2) ||
      !Array.isArray(r.pieces) ||
      new Set(r.pieces).size !== r.pieces.length ||
      r.pieces.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= def.pieces.length,
      )
    )
      return fail();
    const move = moveSpec(def, r.key);
    const pieces = expected.rotations.flatMap((rotation, index) =>
      move.affects(index, rotation) ? [index] : [],
    );
    if (
      r.axis.some(
        (component, i) => Math.abs(component - move.axis[i]) > 1e-5,
      ) ||
      r.pieces.length !== pieces.length ||
      r.pieces.some((index) => !pieces.includes(index))
    )
      return fail();
  }
  return { ...p, state: expected, appearance, settings, keys };
}
export function load(session: Session, project: unknown) {
  const p = validate(session, project);
  session.pause();
  session.cancelSolve();
  session.motion.transition(() => {
    session.patch({
      puzzle: p.state,
      history: p.history,
      cursor: p.cursor,
      appearance: p.appearance,
      settings: p.settings,
      keys: p.keys,
      presets: p.presets,
      selected: [],
      player: null,
      scramble: p.scramble || '',
      scrambleState: p.scrambleState,
      solveResult: null,
      artVersion: session.state.artVersion + 1,
    });
    session.motion.restore(p.residuals);
  });
}
export function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    ),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const restored = new Set<string>();
export async function restore(session: Session) {
  if (restored.has(session.def.id)) return;
  restored.add(session.def.id);
  const initial = session.state.puzzle,
    appearance = session.state.appearance;
  try {
    const auto = localStorage.getItem(`axis-${session.def.id}-auto`) === 'true';
    session.patch({ autoSave: auto });
    const p = await read(session, auto);
    if (
      p &&
      session.state.puzzle === initial &&
      session.state.appearance === appearance
    )
      load(session, p);
  } catch {
    session.notify('common.storage');
  }
}
export function watch(session: Session) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous = session.state;
  const unsubscribe = session.subscribe(() => {
    const current = session.state;
    const changed =
      current.puzzle !== previous.puzzle ||
      current.appearance !== previous.appearance ||
      current.settings !== previous.settings ||
      current.keys !== previous.keys ||
      current.presets !== previous.presets ||
      current.motionVersion !== previous.motionVersion;
    previous = current;
    if (!changed || !current.autoSave) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!session.motion.moving)
        void save(session, true).catch(() => session.notify('common.storage'));
    }, 600);
  });
  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}
export function setAutoSave(session: Session, on: boolean) {
  session.patch({ autoSave: on });
  try {
    localStorage.setItem(`axis-${session.def.id}-auto`, String(on));
  } catch {}
  if (on)
    void save(session, true).catch(() => session.notify('common.storage'));
}
