import { validatePresets as validate } from '@/lib/workspace/presets';
import { parseAlgorithm } from './model';
export const presetPolicy = { count: 100, nameLength: 80, parse: parseAlgorithm };
export const validatePresets = (value: unknown) => validate(value, presetPolicy);
