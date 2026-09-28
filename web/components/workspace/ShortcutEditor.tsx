import { useTranslation } from '@/lib/i18n';
import { formatShortcut, keyboardShortcut } from '@/lib/workspace/keybindings';

export default function ShortcutEditor({ bindings, actions = Object.keys(bindings), disabled, onChange, onConflict, onReset }: {
  bindings: Record<string, string>;
  actions?: string[];
  disabled: boolean;
  onChange: (bindings: Record<string, string>) => void;
  onConflict: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    undo: t('motion.undo'), redo: t('motion.redo'),
    playPause: t('keys.playPause'), exitPresentation: t('app.exitPresentation'),
  };
  return (
    <details className="puzzle-keybindings">
      <summary>{t('keys.title')}</summary>
      {actions.map((action) => (
        <label key={action}>
          <span>{labels[action] || action}</span>
          <input aria-label={action} readOnly disabled={disabled}
            value={bindings[action] ? formatShortcut(bindings[action]) : t('keys.unset')}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Tab') return;
              event.preventDefault();
              if (event.repeat || event.nativeEvent.isComposing) return;
              if (event.key === 'Escape') { event.currentTarget.blur(); return; }
              const binding = ['Delete', 'Backspace'].includes(event.key) ? '' : keyboardShortcut(event.nativeEvent);
              if (binding === null) return;
              if (binding && Object.entries(bindings).some(([key, value]) => key !== action && value === binding)) { onConflict(); return; }
              onChange({ ...bindings, [action]: binding });
              event.currentTarget.blur();
            }} />
        </label>
      ))}
      <button className="secondary-button" disabled={disabled} onClick={onReset}>{t('keys.defaults')}</button>
    </details>
  );
}
