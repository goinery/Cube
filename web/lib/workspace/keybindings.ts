import { tx } from '@/lib/i18n';
const keyCode =
  /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-2])|Space|Enter|Escape|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Numpad(?:Add|Subtract|Multiply|Divide|Decimal|Enter))$/;
const shortcutPattern = /^(?:Mod\+)?(?:Alt\+)?(?:Shift\+)?(.+)$/;
export function keyboardShortcut(event: KeyboardEvent): string | null {
  if (event.isComposing || !keyCode.test(event.code)) return null;
  return `${event.ctrlKey || event.metaKey ? 'Mod+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.code}`;
}
// Global puzzle shortcuts must leave focused controls and dialogs in charge.
export function shouldIgnoreShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return true;
  if (document.querySelector('.studio-loading')) return true;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (
    target.closest(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="slider"],[role="combobox"],[role="listbox"],[role="menu"],[role="dialog"],dialog',
    )
  )
    return true;
  return (
    (event.code === 'Space' || event.code === 'Enter') &&
    Boolean(
      target.closest(
        'button,a[href],summary,[role="button"],[role="switch"],[role="checkbox"]',
      ),
    )
  );
}
export function formatShortcut(shortcut: string): string {
  if (!shortcut) return tx('legacy.m425');
  const names: Record<string, string> = {
    Mod: 'Ctrl/⌘',
    Space: tx('legacy.m426'),
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
        part.replace(/^Key|^Digit/, '').replace(/^Numpad/, tx('legacy.m427')),
    )
    .join(' + ');
}
export function validateBindings(value: unknown, defaults: Record<string, string>, validAction: (action: string) => boolean = (action) => action in defaults): Record<string, string> {
  if (value === undefined) return { ...defaults };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('keys.conflict');
  const result = { ...defaults };
  for (const [action, shortcut] of Object.entries(value)) {
    if (!validAction(action) || typeof shortcut !== 'string' || shortcut.length >= 80)
      throw new Error('keys.conflict');
    if (shortcut && !keyCode.test(shortcut.match(shortcutPattern)?.[1] ?? ''))
      throw new Error('keys.conflict');
    result[action] = shortcut;
  }
  const assigned = Object.values(result).filter(Boolean);
  if (new Set(assigned).size !== assigned.length) throw new Error('keys.conflict');
  return result;
}
