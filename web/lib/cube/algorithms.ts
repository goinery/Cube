import { parseAlgorithm } from './model';

export interface AlgorithmPreset {
  name: string;
  algorithm: string;
}
export const MAX_ALGORITHM_PRESETS = 100;
export const MAX_ALGORITHM_LENGTH = 20000;
export const MAX_PRESET_NAME_LENGTH = 40;

export const defaultAlgorithmPresets = (): AlgorithmPreset[] => [
  {
    name: '大中小魔方',
    algorithm: "F D2 L2 B D B' F2 U' F U F2 U2 F' L D F' U",
  },
  { name: '大小魔方', algorithm: "U2 L2 F2 U' B2 D R F' R F' R F' D' B2 U'" },
];

export function validateAlgorithmPreset(value: unknown): AlgorithmPreset {
  if (!value || typeof value !== 'object')
    throw new Error('算法预设格式无效。');
  const preset = value as Partial<AlgorithmPreset>;
  if (
    typeof preset.name !== 'string' ||
    !preset.name.trim() ||
    preset.name.trim().length > MAX_PRESET_NAME_LENGTH
  )
    throw new Error(`请输入 1–${MAX_PRESET_NAME_LENGTH} 字的算法名称。`);
  if (typeof preset.algorithm !== 'string' || !preset.algorithm.trim())
    throw new Error('请输入算法。');
  if (preset.algorithm.length > MAX_ALGORITHM_LENGTH)
    throw new Error(
      `算法最多支持 ${MAX_ALGORITHM_LENGTH.toLocaleString()} 个字符。`,
    );
  return {
    name: preset.name.trim(),
    algorithm: parseAlgorithm(preset.algorithm).join(' '),
  };
}

export function validateAlgorithmPresets(value: unknown): AlgorithmPreset[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > MAX_ALGORITHM_PRESETS
  )
    throw new Error(`算法文件需要包含 1–${MAX_ALGORITHM_PRESETS} 条预设。`);
  const presets = value.map(validateAlgorithmPreset);
  if (new Set(presets.map((preset) => preset.name)).size !== presets.length)
    throw new Error('算法预设的名称不能重复。');
  return presets;
}

export function mergeAlgorithmPresets(
  current: AlgorithmPreset[],
  incoming: AlgorithmPreset[],
): AlgorithmPreset[] {
  const merged = [...current];
  const algorithms = new Set(current.map((preset) => preset.algorithm));
  const names = new Set(current.map((preset) => preset.name));
  for (const preset of incoming) {
    if (algorithms.has(preset.algorithm)) continue;
    let name = preset.name;
    for (let suffix = 2; names.has(name); suffix++) {
      const ending = ` (${suffix})`;
      name =
        preset.name.slice(0, MAX_PRESET_NAME_LENGTH - ending.length) + ending;
    }
    merged.push({ ...preset, name });
    names.add(name);
    algorithms.add(preset.algorithm);
  }
  if (merged.length > MAX_ALGORITHM_PRESETS)
    throw new Error(`最多保存 ${MAX_ALGORITHM_PRESETS} 条算法，本次未导入。`);
  return merged;
}

export async function readAlgorithmFile(
  file: File,
): Promise<AlgorithmPreset[]> {
  if (file.size > 3 * 1024 * 1024) throw new Error('算法文件不能超过 3 MB。');
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error('无法读取算法文件，请选择导出的 JSON 文件。');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('format' in value) ||
    value.format !== 'axis-cube-algorithms' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('presets' in value)
  )
    throw new Error('文件不是受支持的算法预设文件。');
  return validateAlgorithmPresets(value.presets);
}

export function exportAlgorithmFile(presets: AlgorithmPreset[]) {
  const content = {
    format: 'axis-cube-algorithms',
    version: 1,
    presets: validateAlgorithmPresets(presets),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `AXIS-algorithms-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
