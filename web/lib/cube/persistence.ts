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
  v.length < 12_000_000;
function finite(v: unknown, min: number, max: number) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}
export function validateProject(value: unknown): Project {
  if (!value || typeof value !== 'object')
    throw new Error('文件不是有效的 AXIS 方案。');
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
    throw new Error('操作历史无效或版本不支持。');
  const state = apply(solved(), p.history.slice(0, p.cursor));
  if (toFaceletString(state) !== p.facelets)
    throw new Error('魔方状态与合法操作历史不一致；已拒绝导入。');
  const a = defaultAppearance();
  if (!p.appearance?.stickers || !p.appearance.groups)
    throw new Error('方案缺少贴片外观。');
  for (const id of Object.keys(a.stickers)) {
    const art = p.appearance.stickers[id];
    if (
      !art ||
      !/^#[a-f0-9]{6}$/i.test(art.color) ||
      !finite(art.rotation, -3600, 3600) ||
      (art.image && !raster(art.image))
    )
      throw new Error(`贴片 ${id} 的外观数据无效。`);
    a.stickers[id] = {
      color: art.color,
      rotation: art.rotation,
      ...(art.image ? { image: art.image } : {}),
      ...(art.group ? { group: art.group } : {}),
    };
  }
  const groups = Object.entries(p.appearance.groups);
  if (groups.length > 54) throw new Error('图片组数量超出 54 个。');
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
      throw new Error('图片组关系或图片格式无效。');
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
      throw new Error('图片变换参数无效。');
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
      throw new Error('图片区域范围无效。');
    a.groups[id] = { ...g, members: [...g.members] };
  }
  for (const art of Object.values(a.stickers))
    if (art.group && !a.groups[art.group])
      throw new Error('贴片关联的图片组不存在。');
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
    lightAzimuth: [-180, 180],
    lightElevation: [-80, 80],
    lightIntensity: [0, 5],
  };
  const settings = defaultSettings();
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
      throw new Error('未对齐转层的角度数据无效。');
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
  if (getState().busy || getState().solving)
    throw new Error('请等当前转层或求解完成后载入。');
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
  if (file.size > 60 * 1024 * 1024) throw new Error('方案文件不能超过 60 MB。');
  const p = validateProject(JSON.parse(await file.text()));
  loadProject(p);
}
export async function startAutosave() {
  let timer: ReturnType<typeof setTimeout> | null = null,
    active = true;
  const s = getState();
  try {
    const p = await readProject('autosave');
    if (
      p &&
      getState().cursor === s.cursor &&
      getState().artVersion === s.artVersion &&
      !getState().busy
    )
      loadProject(p);
  } catch {
    notify('浏览器存储不可用，可通过导出方案保留作品。');
  }
  let signature = '';
  const unsub = subscribe(() => {
    const s = getState();
    if (s.busy || s.solving) return;
    const current = [
      s.cursor,
      s.history.length,
      s.artVersion,
      JSON.stringify(s.settings),
      JSON.stringify(s.partialTurns),
    ].join('|');
    if (current === signature) return;
    signature = current;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (active)
        void saveProject('autosave').catch(() =>
          notify('自动保存失败：存储空间不足。请导出方案备份。'),
        );
    }, 600);
  });
  return () => {
    active = false;
    unsub();
    if (timer) clearTimeout(timer);
  };
}
