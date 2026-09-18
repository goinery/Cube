'use client';
import { useState } from 'react';
import { Keyboard, RotateCcw } from 'lucide-react';
import { FACES } from '@/lib/cube/model';
import { getState, settings, useCube } from '@/lib/cube/store';
import {
  defaultKeybindings,
  formatShortcut,
  keyboardShortcut,
  shortcutActions,
  shortcutLabels,
  type ShortcutAction,
} from '@/lib/cube/keybindings';

export default function KeybindingsPanel() {
  const s = useCube('settings', 'solving');
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [message, setMessage] = useState('');
  function input(action: ShortcutAction) {
    return (
      <input
        className={recording === action ? 'recording' : ''}
        aria-label={`设置${shortcutLabels[action]}键位`}
        title={formatShortcut(s.settings.keybindings[action])}
        value={
          recording === action
            ? '请按键…'
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
              `${formatShortcut(shortcut)} 已用于「${shortcutLabels[conflict]}」，请换一个键位或先清除原绑定。`,
            );
            return;
          }
          settings({ keybindings: { ...bindings, [action]: shortcut } });
          setMessage(
            `「${shortcutLabels[action]}」${shortcut ? `已设为 ${formatShortcut(shortcut)}` : '已清除绑定'}。`,
          );
          event.currentTarget.blur();
        }}
      />
    );
  }
  return (
    <details className="keybindings-panel">
      <summary>
        <Keyboard size={14} /> 自定义操作键位
      </summary>
      <p className="microcopy">
        点击键位后按下单键或组合键。Delete / Backspace 清除，Esc
        取消。设置随方案保存。
      </p>
      <div className="keybindings-grid">
        <span>面</span>
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
      <p className="keybindings-message" role="status">
        {message}
      </p>
      <button
        className="text-button"
        disabled={s.solving}
        onClick={() => {
          settings({ keybindings: defaultKeybindings() });
          setMessage('已恢复默认键位。');
        }}
      >
        <RotateCcw size={14} /> 恢复默认键位
      </button>
    </details>
  );
}
