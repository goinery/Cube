import { FACES, type Face } from './model';

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
  undo: '撤销',
  redo: '重做',
  playPause: '播放 / 暂停',
  exitPresentation: '退出展示',
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
    undo: 'Mod+KeyZ',
    redo: 'Mod+Shift+KeyZ',
    playPause: 'Space',
    exitPresentation: 'Escape',
  };
}

const keyCode =
  /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-2])|Space|Enter|Escape|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Numpad(?:Add|Subtract|Multiply|Divide|Decimal|Enter))$/;
const shortcutPattern = /^(?:Mod\+)?(?:Alt\+)?(?:Shift\+)?(.+)$/;

export function keyboardShortcut(event: KeyboardEvent): string | null {
  if (event.isComposing || !keyCode.test(event.code)) return null;
  return `${event.ctrlKey || event.metaKey ? 'Mod+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.code}`;
}

export function formatShortcut(shortcut: string): string {
  if (!shortcut) return '未设置';
  const names: Record<string, string> = {
    Mod: 'Ctrl/⌘',
    Space: '空格',
    Escape: 'Esc',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Backquote: '`',
    Minus: '−',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
  };
  return shortcut
    .split('+')
    .map(
      (part) =>
        names[part] ||
        part.replace(/^Key|^Digit/, '').replace(/^Numpad/, '小键盘 '),
    )
    .join(' + ');
}

export function validateKeybindings(value: unknown): Keybindings {
  const defaults = defaultKeybindings();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return defaults;
  const input = value as Record<string, unknown>;
  const bindings = { ...defaults };
  for (const action of shortcutActions) {
    const shortcut = input[action];
    if (shortcut === '') bindings[action] = '';
    else if (typeof shortcut === 'string' && shortcut.length < 60) {
      const code = shortcut.match(shortcutPattern)?.[1];
      if (code && keyCode.test(code)) bindings[action] = shortcut;
      else return defaults;
    } else if (shortcut !== undefined) return defaults;
  }
  const assigned = Object.values(bindings).filter(Boolean);
  return new Set(assigned).size === assigned.length ? bindings : defaults;
}
