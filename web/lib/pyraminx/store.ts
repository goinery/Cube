import { useSyncExternalStore } from 'react';
import { heldAngle, partialsAfterMove, sameLayer, turnsConflict, visibleTurns, type PartialTurn } from './interaction';
import { magneticTarget } from '../cube/interaction';
export type { PartialTurn } from './interaction';
import {
  defaultSettings,
  type Mode,
  type Settings,
  type View,
} from '../cube/store';
import {
  AXES,
  FACE_COLORS,
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
  partials: PartialTurn[];
  settings: Settings;
  mode: Mode;
  view: View;
  busy: boolean;
  dragging: boolean;
  settling: boolean;
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
      FACE_COLORS[t.face],
    ]),
  );
export const defaultPyraminxSettings = (): Settings => ({
  ...defaultSettings(),
  gap: 0,
  turnTolerance: 120,
});
let state: State = {
  puzzle: solved(),
  history: [],
  cursor: 0,
  partials: [],
  settings: defaultPyraminxSettings(),
  mode: 'play',
  view: 'hidden',
  busy: false,
  dragging: false,
  settling: false,
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
  layerTurn?: boolean;
}
let animator: (a: Animation) => Promise<number> = async (a) => a.to;
let alignmentAnimator: (
  partial: PartialTurn,
  duration: number,
) => Promise<void> = async () => {};
export function setAlignmentAnimator(fn: typeof alignmentAnimator) {
  alignmentAnimator = fn;
}
let interruptMagnet = () => {};
export function setAnimator(fn: typeof animator, interrupt = () => {}) {
  animator = fn;
  interruptMagnet = interrupt;
}
export function interruptSettling() {
  if (state.settling && !state.solving) interruptMagnet();
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
export function canAlign(partials = state.partials) {
  return partials.every((p) => Math.abs(p.angle) <=
    (state.settings.turnTolerance * Math.PI) / 180 + 1e-8);
}
function startAlignment(partials = state.partials) {
  if (!partials.length) return Promise.resolve();
  const animations = visibleTurns(partials).map((partial) => alignmentAnimator(
    partial,
    Math.max(180, Math.min(420,
      (220 + (Math.abs(partial.angle) / TURN) * 160) / state.settings.speed)),
  ));
  patch({ partials: state.partials.filter((p) => !partials.includes(p)) });
  return Promise.all(animations).then(() => {});
}
export async function align(force = false) {
  if (!state.partials.length) return true;
  if (!force && !canAlign()) {
    notify(`转层偏差超出 ${state.settings.turnTolerance}°，请沿原层拖动对齐。`);
    return false;
  }
  const wasBusy = state.busy, previousMove = state.currentMove;
  patch({ busy: true, currentMove: '转层对齐' });
  try {
    await startAlignment();
    return true;
  } finally {
    patch({ busy: wasBusy, currentMove: previousMove });
  }
}
export async function perform(
  token: string,
  source: 'manual' | 'player' | 'undo' | 'redo' = 'manual',
  instant = false,
) {
  if (source === 'manual') interruptSettling();
  if (state.busy || state.solving || state.dragging) return false;
  const move = parseMove(token);
  const conflicts = state.partials.filter((p) => turnsConflict(p, move));
  if (!canAlign(conflicts)) {
    notify('请先对齐当前转层。');
    return false;
  }
  if (source === 'manual') {
    pause();
    patch({ player: null });
  }
  patch({ busy: true, currentMove: token });
  try {
    const alignment = startAlignment(conflicts);
    if (instant) await alignment;
    else {
      const from = heldAngle(state.partials, move);
      await animator({ move, from, to: from - TURN * move.direction });
    }
    const puzzle = turn(state.puzzle, token);
    const partials = partialsAfterMove(state.partials, move);
    if (source === 'undo') patch({ puzzle, partials, cursor: state.cursor - 1 });
    else if (source === 'redo') patch({ puzzle, partials, cursor: state.cursor + 1 });
    else {
      const history = [...state.history.slice(0, state.cursor), token];
      patch({ puzzle, partials, history, cursor: history.length });
    }
    // Commit the new layer at its visible endpoint even if the old layer is
    // still aligning; its local visual offsets follow the committed pieces.
    await alignment;
    return true;
  } finally {
    patch({ busy: false, currentMove: '' });
  }
}
export function beginDrag(move: Move) {
  interruptSettling();
  if (state.busy || state.solving) return false;
  const conflicts = state.partials.filter((p) => turnsConflict(p, move));
  if (!canAlign(conflicts)) {
    notify(`转层偏差超出 ${state.settings.turnTolerance}°，请沿原层拖动对齐。`);
    return false;
  }
  pause();
  patch({
    busy: true,
    dragging: true,
    player: null,
    currentMove: moveToken(move.axis, move.layer),
  });
  if (conflicts.length)
    void startAlignment(conflicts).catch(() => notify('归位未完成，请重试。'));
  return true;
}
let dragCompletion = 0;
export function finishDrag(move: Move, angle: number) {
  dragCompletion++;
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
    partials: [
      ...(token ? partialsAfterMove(state.partials, parseMove(token)) : state.partials)
        .filter((p) => !sameLayer(p, move)),
      ...(Math.abs(residual) > 1e-5
        ? [{ axis: move.axis, layer: move.layer, angle: residual }]
        : []),
    ],
    busy: false,
    dragging: false,
    settling: false,
    currentMove: '',
    player: null,
  });
}
export async function releaseDrag(
  move: Move,
  angle: number,
  velocity: number,
  targetAngle = angle,
) {
  const completion = dragCompletion;
  const magnetic = state.settings.magnetStrength > 0;
  const settling = magnetic || Math.abs(targetAngle - angle) > 1e-5;
  patch({ dragging: false, settling });
  if (settling) {
    const target = magnetic
      ? magneticTarget(targetAngle, velocity / 1000, TURN)
      : targetAngle;
    angle = await animator({
      move,
      from: angle,
      to: target,
      magnetic,
      layerTurn: true,
      velocity,
      duration: magnetic
        ? undefined
        : Math.max(100, 120 / state.settings.speed),
    });
  }
  if (completion === dragCompletion) finishDrag(move, angle);
}
export function settings(update: Partial<Settings>) {
  if (state.solving) return;
  const enable =
    state.settings.magnetStrength === 0 && (update.magnetStrength ?? 0) > 0;
  patch({ settings: { ...state.settings, ...update } });
  if (enable && state.partials.length && !state.busy) void settlePartials();
}
async function settlePartials() {
  const token = generation;
  while (state.partials.length && !state.busy && state.settings.magnetStrength > 0) {
    const partial = state.partials[0];
    patch({ busy: true });
    await releaseDrag({ ...partial, direction: 1 }, partial.angle, 0);
    if (token !== generation) break;
  }
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
    partials: [],
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
  const p = state.player!;
  target = Math.max(0, Math.min(p.moves.length, Math.round(target)));
  const backwards = target < p.index;
  const moves = backwards
    ? p.moves.slice(target, p.index).reverse().map(inverseMove)
    : p.moves.slice(p.index, target);
  if (!canPerformSequence(moves)) return;
  for (const token of moves) {
    if (!(await perform(token, backwards ? 'undo' : 'player', true))) return;
    patch({ player: { ...state.player!, index: state.player!.index + (backwards ? -1 : 1), playing: false } });
  }
}
function canPerformSequence(moves: string[]) {
  let partials = state.partials;
  for (const token of moves) {
    const move = parseMove(token), conflicts = partials.filter((p) => turnsConflict(p, move));
    if (!canAlign(conflicts)) {
      notify('请先对齐当前转层。');
      return false;
    }
    partials = partialsAfterMove(partials.filter((p) => !conflicts.includes(p)), move);
  }
  return true;
}
export async function applyInstant(moves: string[]) {
  if (state.busy || state.solving) return;
  pause();
  if (!canPerformSequence(moves)) return;
  patch({ player: null });
  for (const token of moves)
    if (!(await perform(token, 'player', true))) return;
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
  if (isSolved(state.puzzle) && state.puzzle.frame === 0) {
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
  } = state;
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
  // Read older saved projects that had room for only one unfinished layer.
  const legacy = (p as Project & { partial?: PartialTurn | null }).partial;
  const partials = p.partials ?? (legacy ? [legacy] : []);
  if (!Array.isArray(partials) || partials.length > 7 || partials.some((partial, index) =>
    !partial || !Number.isInteger(partial.axis) || !finite(partial.axis, 0, 3) ||
    !['tip', 'body', 'base'].includes(partial.layer) ||
    !finite(partial.angle, -TURN / 2, TURN / 2) ||
    partials.slice(0, index).some((other) => sameLayer(other, partial) || turnsConflict(other, partial))))
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
    partials: partials.map((p) => ({ ...p })),
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
