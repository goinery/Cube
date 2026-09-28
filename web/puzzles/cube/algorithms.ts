import { validatePreset,validatePresets,mergePresets } from '@/lib/workspace/presets';
import { builtinLabel,tx } from '@/lib/i18n';
import { DEFAULT_PRESETS } from '@/puzzles/config';
import { parseAlgorithm } from './model';
export interface AlgorithmPreset {
  name: string;
  algorithm: string;
}
export const MAX_ALGORITHM_PRESETS = 100;
export { MAX_ALGORITHM_LENGTH } from '@/lib/workspace/presets';
export const MAX_PRESET_NAME_LENGTH = 40;
export const defaultAlgorithmPresets = (): AlgorithmPreset[] =>
  DEFAULT_PRESETS.cube.map(({ labelKey, algorithm }) => ({
    name: tx(labelKey),
    algorithm,
  }));
export function algorithmPresetLabel(preset: AlgorithmPreset) {
  const index = defaultAlgorithmPresets().findIndex(
    (item) => item.algorithm === preset.algorithm,
  );
  return index < 0
    ? preset.name
    : builtinLabel(preset.name, DEFAULT_PRESETS.cube[index].labelKey);
}
export const presetPolicy = { count: MAX_ALGORITHM_PRESETS, nameLength: MAX_PRESET_NAME_LENGTH, parse: parseAlgorithm };
export const validateAlgorithmPreset = (value: unknown) => validatePreset(value, presetPolicy);
export const validateAlgorithmPresets = (value: unknown) => validatePresets(value, presetPolicy);
export const mergeAlgorithmPresets = (current: AlgorithmPreset[], incoming: AlgorithmPreset[]) => mergePresets(current, incoming, presetPolicy);
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
