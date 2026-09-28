import { keyboardShortcut,formatShortcut } from '@/lib/workspace/keybindings';
import { tx,useLanguage } from '@/lib/i18n';
import { useState } from 'react';
import { Keyboard,RotateCcw } from 'lucide-react';
import { FACES } from '@/puzzles/cube/model';
import { getState,settings,useCube } from '@/puzzles/cube/store';
import {
defaultKeybindings,
shortcutActions,
shortcutLabels,
type ShortcutAction,
} from '@/puzzles/cube/keybindings';
export default function KeybindingsPanel() {
  useLanguage();
  const s = useCube('settings', 'solving');
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [message, setMessage] = useState('');
  function input(action: ShortcutAction) {
    return (
      <input
        className={recording === action ? 'recording' : ''}
        aria-label={tx('legacy.m231', { p0: shortcutLabels[action] })}
        title={formatShortcut(s.settings.keybindings[action])}
        value={
          recording === action
            ? tx('legacy.m232')
            : formatShortcut(s.settings.keybindings[action])
        }
        readOnly
        disabled={s.solving}
        onFocus={() => {
          setRecording(action);
          setMessage('');
        }}
        onBlur={() => setRecording(null)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Tab') return;
          event.preventDefault();
          if (event.repeat || event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            event.currentTarget.blur();
            return;
          }
          const shortcut = ['Backspace', 'Delete'].includes(event.key)
            ? ''
            : keyboardShortcut(event.nativeEvent);
          if (shortcut === null) return;
          const bindings = getState().settings.keybindings;
          const conflict = shortcutActions.find(
            (other) =>
              other !== action && shortcut && bindings[other] === shortcut,
          );
          if (conflict) {
            setMessage(
              tx('legacy.m233', {
                p0: formatShortcut(shortcut),
                p1: shortcutLabels[conflict],
              }),
            );
            return;
          }
          settings({ keybindings: { ...bindings, [action]: shortcut } });
          setMessage(
            `「${shortcutLabels[action]}」${shortcut ? tx('legacy.m234', { p0: formatShortcut(shortcut) }) : tx('legacy.m235')}。`,
          );
          event.currentTarget.blur();
        }}
      />
    );
  }
  return (
    <details className="keybindings-panel">
      <summary>
        <Keyboard size={14} />
        {tx('legacy.m236')}
      </summary>
      <></>
      <div className="keybindings-grid">
        <span>{tx('legacy.m203')}</span>
        <span>90°</span>
        <span>−90°</span>
        <span>180°</span>
        {FACES.map((face) => (
          <div className="keybindings-row" key={face}>
            <strong>{face}</strong>
            {input(face)}
            {input(`${face}'`)}
            {input(`${face}2`)}
          </div>
        ))}
      </div>
      <div className="keybindings-general">
        {(['undo', 'redo', 'playPause', 'exitPresentation'] as const).map(
          (action) => (
            <label key={action}>
              <span>{shortcutLabels[action]}</span>
              {input(action)}
            </label>
          ),
        )}
      </div>
      <output className="keybindings-message">
        {message}
      </output>
      <button
        className="text-button"
        disabled={s.solving}
        onClick={() => {
          settings({ keybindings: defaultKeybindings() });
          setMessage(tx('legacy.m238'));
        }}
      >
        <RotateCcw size={14} />
        {tx('legacy.m239')}
      </button>
    </details>
  );
}
