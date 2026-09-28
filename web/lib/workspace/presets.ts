import { tx } from '@/lib/i18n';
export interface AlgorithmPreset { name: string; algorithm: string }
export interface PresetPolicy { count: number; nameLength: number; parse: (input: string) => string[] }
export const MAX_ALGORITHM_LENGTH = 20000;
export function validatePreset(value: unknown, policy: PresetPolicy): AlgorithmPreset {
  if (!value || typeof value !== 'object') throw new Error(tx('legacy.m410'));
  const p = value as AlgorithmPreset;
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.trim().length > policy.nameLength)
    throw new Error(tx('legacy.m411', { p0: policy.nameLength }));
  if (typeof p.algorithm !== 'string' || !p.algorithm.trim()) throw new Error(tx('legacy.m412'));
  if (p.algorithm.length > MAX_ALGORITHM_LENGTH) throw new Error(tx('legacy.m413', { p0: MAX_ALGORITHM_LENGTH }));
  const algorithm = policy.parse(p.algorithm).join(' ');
  if (!algorithm) throw new Error(tx('legacy.m412'));
  return { name: p.name.trim(), algorithm };
}
export function validatePresets(value: unknown, policy: PresetPolicy): AlgorithmPreset[] {
  if (!Array.isArray(value) || value.length > policy.count) throw new Error(tx('legacy.m414', { p0: policy.count }));
  return value.map((p) => validatePreset(p, policy));
}
export function addPreset<T extends AlgorithmPreset>(current: T[], preset: T, policy: PresetPolicy): T[] {
  const normalized = { ...preset, ...validatePreset(preset, policy) };
  if (current.length >= policy.count) throw new Error(tx('legacy.m001', { p0: policy.count }));
  if (current.some((p) => p.name === normalized.name)) throw new Error(tx('legacy.m002'));
  const duplicate = current.find((p) => p.algorithm === normalized.algorithm);
  if (duplicate) throw new Error(tx('legacy.m003', { p0: duplicate.name }));
  return [...current, normalized];
}
export function mergePresets<T extends AlgorithmPreset>(current: T[], incoming: T[], policy: PresetPolicy): T[] {
  const merged = [...current];
  for (const item of incoming) {
    const preset = { ...item, ...validatePreset(item, policy) };
    if (merged.some((p) => p.algorithm === preset.algorithm)) continue;
    let name = preset.name;
    for (let suffix = 2; merged.some((p) => p.name === name); suffix++) {
      const ending = ` (${suffix})`;
      name = preset.name.slice(0, policy.nameLength - ending.length) + ending;
    }
    merged.push({ ...preset, name });
  }
  if (merged.length > policy.count) throw new Error(tx('legacy.m416', { p0: policy.count }));
  return merged;
}
