import { validateBindings } from '@/lib/workspace/keybindings';
import { tx } from '@/lib/i18n';
import { GENERAL_KEYS } from '@/puzzles/config';
import { FACES,type Face } from './model';
export type ShortcutAction =
  | Face
  | `${Face}'`
  | `${Face}2`
  | 'undo'
  | 'redo'
  | 'playPause'
  | 'exitPresentation';
export type Keybindings = Record<ShortcutAction, string>;
export const shortcutActions: ShortcutAction[] = [
  ...FACES.flatMap(
    (face) => [face, `${face}'`, `${face}2`] as ShortcutAction[],
  ),
  'undo',
  'redo',
  'playPause',
  'exitPresentation',
];
export const shortcutLabels: Record<ShortcutAction, string> =
  Object.fromEntries(
    shortcutActions.map((action) => [action, action]),
  ) as Record<ShortcutAction, string>;
Object.assign(shortcutLabels, {
  undo: tx('legacy.m086'),
  redo: tx('legacy.m087'),
  playPause: tx('legacy.m335'),
  exitPresentation: tx('legacy.m336'),
});
export function defaultKeybindings(): Keybindings {
  const bindings = {} as Keybindings;
  for (const face of FACES) {
    bindings[face] = `Key${face}`;
    bindings[`${face}'`] = `Shift+Key${face}`;
    bindings[`${face}2`] = `Alt+Key${face}`;
  }
  return {
    ...bindings,
    ...GENERAL_KEYS,
  };
}
export function validateKeybindings(value: unknown): Keybindings {
  const defaults = defaultKeybindings();
  try { return validateBindings(value, defaults) as Keybindings; }
  catch { return defaults; }
}
