import { tx } from '@/lib/i18n';
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
    name: tx('legacy.m408'),
    algorithm: "F D2 L2 B D B' F2 U' F U F2 U2 F' L D F' U",
  },
  {
    name: tx('legacy.m409'),
    algorithm: "U2 L2 F2 U' B2 D R F' R F' R F' D' B2 U'",
  },
];
export function validateAlgorithmPreset(value: unknown): AlgorithmPreset {
  if (!value || typeof value !== 'object') throw new Error(tx('legacy.m410'));
  const preset = value as Partial<AlgorithmPreset>;
  if (
    typeof preset.name !== 'string' ||
    !preset.name.trim() ||
    preset.name.trim().length > MAX_PRESET_NAME_LENGTH
  )
    throw new Error(tx('legacy.m411', { p0: MAX_PRESET_NAME_LENGTH }));
  if (typeof preset.algorithm !== 'string' || !preset.algorithm.trim())
    throw new Error(tx('legacy.m412'));
  if (preset.algorithm.length > MAX_ALGORITHM_LENGTH)
    throw new Error(
      tx('legacy.m413', { p0: MAX_ALGORITHM_LENGTH.toLocaleString() }),
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
    throw new Error(tx('legacy.m414', { p0: MAX_ALGORITHM_PRESETS }));
  const presets = value.map(validateAlgorithmPreset);
  if (new Set(presets.map((preset) => preset.name)).size !== presets.length)
    throw new Error(tx('legacy.m415'));
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
    throw new Error(tx('legacy.m416', { p0: MAX_ALGORITHM_PRESETS }));
  return merged;
}
export async function readAlgorithmFile(
  file: File,
): Promise<AlgorithmPreset[]> {
  if (file.size > 3 * 1024 * 1024) throw new Error(tx('legacy.m417'));
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error(tx('legacy.m418'));
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
    throw new Error(tx('legacy.m419'));
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
