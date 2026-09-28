import { tx } from '@/lib/i18n';
import { validatePreset,type PresetPolicy } from '@/lib/workspace/presets';
import { parseAlgorithm } from './model';
import type { Definition } from './types';
import type { Preset } from './session';
export const presetPolicy = (def: Definition): PresetPolicy => ({ count: 200, nameLength: 100, parse: (input) => parseAlgorithm(def, input) });
export function validatePresets(def: Definition, value: unknown): Preset[] {
  const policy = presetPolicy(def);
  if (!Array.isArray(value) || value.length > policy.count) throw new Error('project.invalid');
  const ids = new Set<string>();
  return value.map((p) => {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id)) throw new Error('project.invalid');
    ids.add(p.id);
    const labelKey = typeof p.labelKey === 'string' ? p.labelKey : undefined;
    const normalized = validatePreset({ ...p, name: p.name || (labelKey ? tx(labelKey) : '') }, policy);
    return { ...normalized, id: p.id, ...(labelKey ? { labelKey } : {}) };
  });
}
