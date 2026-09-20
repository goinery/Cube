import { useSyncExternalStore } from 'react';
import {
  defaultSettings,
  type Mode,
  type Settings,
  type View,
} from '../cube/store';
import {
  AXES,
  TILES,
  TURN,
  apply,
  inverseMove,
  isSolved,
  moveToken,
  parseAlgorithm,
  parseMove,
  solved,
  turn,
  type Move,
  type PuzzleState,
} from './model';

export interface Photo {
  src: string;
  scale: number;
  x: number;
  y: number;
  rotation: number;
}
export interface PartialTurn {
  axis: number;
  layer: Move['layer'];
  angle: number;
}
export interface Player {
  moves: string[];
  index: number;
  title: string;
  playing: boolean;
  bodyLength?: number;
}
export interface Preset {
  name: string;
  algorithm: string;
}
export const defaultPresets = (): Preset[] => [
  { name: '三棱循环', algorithm: "R U R' U R U R' U" },
  { name: '左右交替', algorithm: "L R' L' R U R U' R'" },
  { name: '四顶角', algorithm: 'u l r b' },
  { name: '底层转动', algorithm: "Uw Rw' Bw Lw'" },
];
export const defaultKeys = (): Record<string, string> => ({
  ...Object.fromEntries(
    AXES.flatMap((axis) =>
      (['body', 'tip', 'base'] as const).flatMap((layer) =>
        [1, -1].map((d) => [
          moveToken(AXES.indexOf(axis), layer, d),
          `${layer === 'base' ? 'Mod+Alt+' : layer === 'tip' ? 'Alt+' : ''}${d < 0 ? 'Shift+' : ''}Key${axis}`,
        ]),
      ),
    ),
  ),
  undo: 'Mod+KeyZ',
  redo: 'Mod+Shift+KeyZ',
  playPause: 'Space',
  exitPresentation: 'Escape',
});
export interface State {
  puzzle: PuzzleState;
  history: string[];
  cursor: number;
  partial: PartialTurn | null;
  settings: Settings;
  mode: Mode;
  view: View;
  busy: boolean;
  dragging: boolean;
  currentMove: string;
  player: Player | null;
  scramble: string;
  notice: string;
  selected: string[];
  colors: Record<string, string>;
  photos: Record<string, Photo>;
  editFace: number;
  presets: Preset[];
  keybindings: Record<string, string>;
  autoSave: boolean;
  presentation: boolean;
  solving: boolean;
  solveStatus: string;
  ready: boolean;
}
export const defaultColors = () =>
  Object.fromEntries(
    TILES.map((t) => [
      t.id,
      ['#f6df13', '#ed283b', '#13cd45', '#143cfa'][t.face],
    ]),
  );
export const defaultPyraminxSettings = (): Settings => ({
  ...defaultSettings(),
  turnTolerance: 120,
});
let state: State = {
  puzzle: solved(),
  history: [],
  cursor: 0,
  partial: null,
  settings: defaultPyraminxSettings(),
  mode: 'play',
  view: 'hidden',
  busy: false,
  dragging: false,
  currentMove: '',
  player: null,
  scramble: '',
  notice: '',
  selected: [],
  colors: defaultColors(),
  photos: {},
  editFace: 3,
  presets: defaultPresets(),
  keybindings: defaultKeys(),
  autoSave: false,
  presentation: false,
  solving: false,
  solveStatus: '',
  ready: false,
};
const listeners = new Set<() => void>();
export const getState = () => state;
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function patch(update: Partial<State>) {
  if (
    Object.entries(update).every(([k, v]) =>
      Object.is(state[k as keyof State], v),
    )
  )
    return;
  state = { ...state, ...update };
  listeners.forEach((fn) => fn());
}
export const usePyraminx = () =>
  useSyncExternalStore(subscribe, getState, getState);
let noticeTimer: ReturnType<typeof setTimeout>;
export function notify(notice: string) {
  patch({ notice });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => patch({ notice: '' }), 4500);
}
export interface Animation {
  move: Move;
  from: number;
  to: number;
  magnetic?: boolean;
  velocity?: number;
  duration?: number;
}
let animator: (a: Animation) => Promise<number> = async (a) => a.to;
export function setAnimator(fn: typeof animator) {
  animator = fn;
}
export const cameraActions = {
  reset: () => {},
  fit: () => {},
  face: (_face: number) => {},
  focus: () => {},
};
let generation = 0;
export function pause() {
  generation++;
  if (state.player) patch({ player: { ...state.player, playing: false } });
}
const sameLayer = (a: PartialTurn, b: Move) =>
  a.axis === b.axis && a.layer === b.layer;
export function canAlign() {
  return (
    !state.partial ||
    Math.abs(state.partial.angle) <=
      (state.settings.turnTolerance * Math.PI) / 180 + 1e-8
  );
}
export async function align(force = false) {
  const partial = state.partial;
  if (!partial) return true;
  if (!force && !canAlign()) {
    notify(`转层偏差超出 ${state.settings.turnTolerance}°，请沿原层拖动对齐。`);
    return false;
  }
  const wasBusy = state.busy;
  patch({ busy: true });
  await animator({
    move: { ...partial, direction: 1 },
    from: partial.angle,
    to: 0,
    duration: 190 / state.settings.speed,
  });
  patch({ partial: null, busy: wasBusy });
  return true;
}
export async function perform(
  token: string,
  source: 'manual' | 'player' | 'undo' | 'redo' = 'manual',
  instant = false,
) {
  if (state.busy || state.solving || state.dragging) return false;
  const move = parseMove(token);
  if (state.partial && !canAlign()) {
    notify('请先对齐当前转层。');
    return false;
  }
  if (source === 'manual') {
    pause();
    patch({ player: null });
  }
  patch({ busy: true, currentMove: token });
  try {
    if (!(await align())) return false;
    if (!instant) await animator({ move, from: 0, to: -TURN * move.direction });
    const puzzle = turn(state.puzzle, token);
    if (source === 'undo') patch({ puzzle, cursor: state.cursor - 1 });
    else if (source === 'redo') patch({ puzzle, cursor: state.cursor + 1 });
    else {
      const history = [...state.history.slice(0, state.cursor), token];
      patch({ puzzle, history, cursor: history.length });
    }
    return true;
  } finally {
    patch({ busy: false, currentMove: '' });
  }
}
export async function beginDrag(move: Move) {
  if (state.busy || state.solving) return false;
  pause();
  if (state.partial && !sameLayer(state.partial, move)) {
    if (!(await align())) return false;
  }
  patch({
    busy: true,
    dragging: true,
    player: null,
    currentMove: moveToken(move.axis, move.layer),
  });
  return true;
}
export function finishDrag(move: Move, angle: number) {
  const turns = Math.round(-angle / TURN),
    n = ((turns % 3) + 3) % 3;
  const token = n ? moveToken(move.axis, move.layer, n === 1 ? 1 : -1) : '';
  const residual = angle + turns * TURN;
  const history = token
    ? [...state.history.slice(0, state.cursor), token]
    : state.history;
  patch({
    puzzle: token ? turn(state.puzzle, token) : state.puzzle,
    history,
    cursor: token ? history.length : state.cursor,
    partial:
      Math.abs(residual) > 1e-5
        ? { axis: move.axis, layer: move.layer, angle: residual }
        : null,
    busy: false,
    dragging: false,
    currentMove: '',
    player: null,
  });
}
export async function releaseDrag(move: Move, angle: number, velocity: number) {
  patch({ dragging: false });
  if (state.settings.magnetStrength > 0) {
    const target =
      Math.round(
        (angle + Math.max(-0.45, Math.min(0.45, velocity * 0.07))) / TURN,
      ) * TURN;
    angle = await animator({
      move,
      from: angle,
      to: target,
      magnetic: true,
      velocity,
    });
  }
  finishDrag(move, angle);
}
export function settings(update: Partial<Settings>) {
  if (state.solving) return;
  const enable =
    state.settings.magnetStrength === 0 && (update.magnetStrength ?? 0) > 0;
  patch({ settings: { ...state.settings, ...update } });
  if (enable && state.partial && !state.busy) void align(true);
}
export async function undo() {
  if (!state.busy && !state.solving && state.cursor) {
    pause();
    patch({ player: null });
    await perform(inverseMove(state.history[state.cursor - 1]), 'undo');
  }
}
export async function redo() {
  if (!state.busy && !state.solving && state.cursor < state.history.length) {
    pause();
    patch({ player: null });
    await perform(state.history[state.cursor], 'redo');
  }
}
export function resetPuzzle() {
  if (state.busy || state.solving) return;
  pause();
  patch({
    puzzle: solved(),
    history: [],
    cursor: 0,
    partial: null,
    player: null,
    scramble: '',
    selected: [],
  });
}
export function loadPlayer(
  moves: string[],
  title: string,
  bodyLength?: number,
) {
  if (state.busy || state.solving) return;
  pause();
  patch({ player: { moves, title, index: 0, playing: false, bodyLength } });
}
export async function next() {
  const p = state.player;
  if (!p || state.busy || state.solving || p.index >= p.moves.length)
    return false;
  const ok = await perform(p.moves[p.index], 'player');
  if (ok && state.player?.moves === p.moves)
    patch({ player: { ...state.player, index: p.index + 1 } });
  return ok;
}
export async function previous() {
  const p = state.player;
  if (!p || state.busy || state.solving || !p.index) return;
  pause();
  if (await perform(inverseMove(p.moves[p.index - 1]), 'undo'))
    patch({ player: { ...p, index: p.index - 1, playing: false } });
}
export async function play() {
  if (!state.player || state.busy || state.solving) return;
  const token = ++generation;
  patch({ player: { ...state.player, playing: true } });
  while (
    token === generation &&
    state.player &&
    state.player.index < state.player.moves.length
  )
    if (!(await next())) break;
  if (token === generation && state.player)
    patch({ player: { ...state.player, playing: false } });
}
export async function seek(target: number) {
  if (!state.player || state.busy || state.solving) return;
  pause();
  if (!(await align())) return;
  const p = state.player!;
  target = Math.max(0, Math.min(p.moves.length, Math.round(target)));
  const backwards = target < p.index;
  const moves = backwards
    ? p.moves.slice(target, p.index).reverse().map(inverseMove)
    : p.moves.slice(p.index, target);
  const history = backwards
    ? state.history
    : [...state.history.slice(0, state.cursor), ...moves];
  patch({
    puzzle: apply(state.puzzle, moves),
    history,
    cursor: state.cursor + target - p.index,
    player: { ...p, index: target, playing: false },
  });
}
export async function applyInstant(moves: string[]) {
  if (state.busy || state.solving) return;
  pause();
  if (!(await align())) return;
  const history = [...state.history.slice(0, state.cursor), ...moves];
  patch({
    puzzle: apply(state.puzzle, moves),
    history,
    cursor: history.length,
    player: null,
  });
}
export function replayHistory() {
  if (state.busy || state.solving) return;
  const moves = state.history.slice(0, state.cursor);
  resetPuzzle();
  loadPlayer(moves, '历史回放');
  void play();
}
export function runAlgorithm(input: string) {
  try {
    const moves = parseAlgorithm(input);
    if (!moves.length) throw new Error('请先输入算法。');
    loadPlayer(moves, '算法播放');
    void play();
  } catch (error) {
    notify((error as Error).message);
  }
}
let worker: Worker | null = null;
export function cancelSolve() {
  worker?.terminate();
  worker = null;
  patch({ solving: false, solveStatus: '' });
}
export async function startSolve() {
  if (state.busy || state.solving) return;
  pause();
  if (!(await align())) return;
  if (isSolved(state.puzzle)) {
    notify('金字塔已经复原。');
    return;
  }
  patch({ solving: true, solveStatus: '正在初始化求解器…', player: null });
  try {
    worker ??= new Worker(new URL('./solver.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event) => {
      if (event.data.status) patch({ solveStatus: event.data.status });
      else if (event.data.error) {
        cancelSolve();
        notify(event.data.error);
      } else if (event.data.result) {
        patch({ solving: false, solveStatus: '' });
        loadPlayer(
          event.data.result.moves,
          '金字塔求解',
          event.data.result.bodyLength,
        );
        void play();
      }
    };
    worker.onerror = () => {
      cancelSolve();
      notify('求解器启动失败，请重试。');
    };
    worker.postMessage(state.puzzle);
  } catch {
    cancelSolve();
    notify('求解器启动失败，请重试。');
  }
}
let beforePresentation = false;
export function setPresentation(on: boolean) {
  if (on === state.presentation) return;
  if (on) beforePresentation = state.settings.autoRotate;
  patch({
    presentation: on,
    settings: { ...state.settings, autoRotate: on ? true : beforePresentation },
  });
}
export function selectTile(id: string) {
  const tile = TILES.find((t) => t.id === id);
  if (!tile || state.solving) return;
  patch({
    selected: state.selected.includes(id)
      ? state.selected.filter((s) => s !== id)
      : [...state.selected, id],
    editFace: tile.face,
  });
}
export interface Project {
  version: 1;
  puzzle: 'pyraminx';
  history: string[];
  cursor: number;
  partial: PartialTurn | null;
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
    partial,
    colors,
    photos,
    settings,
    presets,
    keybindings,
  } = state;
  return {
    version: 1,
    puzzle: 'pyraminx',
    history,
    cursor,
    partial,
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
    throw new Error('请选择金字塔魔方方案。');
  if (
    !Array.isArray(p.history) ||
    p.history.length > 20000 ||
    !Number.isInteger(p.cursor) ||
    p.cursor < 0 ||
    p.cursor > p.history.length
  )
    throw new Error('方案历史无效。');
  p.history.forEach((m) => {
    if (typeof m !== 'string') throw new Error('转动无效。');
    parseMove(m);
  });
  if (
    p.partial &&
    (!Number.isInteger(p.partial.axis) ||
      !finite(p.partial.axis, 0, 3) ||
      !['tip', 'body', 'base'].includes(p.partial.layer) ||
      !finite(p.partial.angle, -TURN / 2, TURN / 2))
  )
    throw new Error('未对齐转层无效。');
  const colors = defaultColors();
  for (const id of Object.keys(colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(p.colors?.[id]))
      throw new Error('贴片颜色无效。');
    colors[id] = p.colors[id];
  }
  const photos: State['photos'] = {};
  for (const [face, photo] of Object.entries(p.photos || {})) {
    if (
      !/^[0-3]$/.test(face) ||
      typeof photo?.src !== 'string' ||
      photo.src.length > 2_000_000 ||
      !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(photo.src) ||
      !finite(photo.scale, 0.25, 4) ||
      !finite(photo.x, -1, 1) ||
      !finite(photo.y, -1, 1) ||
      !finite(photo.rotation, -360, 360)
    )
      throw new Error('整面图片无效。');
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
    if (!finite(v, min, max)) throw new Error(`参数 ${key} 无效。`);
    Object.assign(settings, { [key]: v });
  }
  for (const key of ['autoRotate', 'lightFollowCamera', 'showMagnets'] as const)
    if (typeof p.settings?.[key] === 'boolean') settings[key] = p.settings[key];
  if (['auto', 'high', 'low'].includes(p.settings?.quality))
    settings.quality = p.settings.quality;
  if (['smooth', 'magnetic', 'linear'].includes(p.settings?.easing))
    settings.easing = p.settings.easing;
  const presets = validatePresets(p.presets ?? defaultPresets());
  const keybindings = defaultKeys();
  for (const action of Object.keys(keybindings))
    if (
      typeof p.keybindings?.[action] === 'string' &&
      p.keybindings[action].length < 80
    )
      keybindings[action] = p.keybindings[action];
  const keys = Object.values(keybindings).filter(Boolean);
  if (new Set(keys).size !== keys.length) throw new Error('方案包含重复键位。');
  return {
    version: 1,
    puzzle: 'pyraminx',
    history: [...p.history],
    cursor: p.cursor,
    partial: p.partial ?? null,
    colors,
    photos,
    settings,
    presets,
    keybindings,
  };
}
export function validatePresets(value: unknown): Preset[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('算法列表无效。');
  return value.map((p) => {
    if (
      typeof p?.name !== 'string' ||
      !p.name.trim() ||
      p.name.length > 80 ||
      typeof p.algorithm !== 'string' ||
      !parseAlgorithm(p.algorithm).length
    )
      throw new Error('算法名称或公式无效。');
    return {
      name: p.name.trim(),
      algorithm: parseAlgorithm(p.algorithm).join(' '),
    };
  });
}
export function importProject(value: unknown) {
  if (state.busy || state.solving) return;
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
    notify('本机金字塔方案无法读取，可重新导入备份。');
  }
}
export function saveLocal(auto = false) {
  try {
    localStorage.setItem(
      `${KEY}-${auto ? 'autosave' : 'saved'}`,
      JSON.stringify(captureProject()),
    );
    if (!auto) notify('金字塔方案已保存到本机。');
  } catch {
    notify('本机空间不足，请导出方案备份。');
  }
}
export function setAutoSave(on: boolean) {
  try {
    localStorage.setItem(`${KEY}-auto`, String(on));
    patch({ autoSave: on });
    if (on) saveLocal(true);
  } catch {
    notify('无法保存自动保存偏好。');
  }
}
export function watchAutosave() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous = captureProject();
  let dirty = false;
  const unsubscribe = subscribe(() => {
    const next = captureProject();
    if (
      !Object.keys(next).every(
        (k) => next[k as keyof Project] === previous[k as keyof Project],
      )
    )
      dirty = true;
    previous = next;
    if (state.autoSave && !state.busy && dirty) {
      dirty = false;
      clearTimeout(timer);
      timer = setTimeout(() => saveLocal(true), 400);
    }
  });
  const flush = () => {
    if (state.autoSave) saveLocal(true);
  };
  window.addEventListener('pagehide', flush);
  return () => {
    clearTimeout(timer);
    flush();
    unsubscribe();
    window.removeEventListener('pagehide', flush);
  };
}
