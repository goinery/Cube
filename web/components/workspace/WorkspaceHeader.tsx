import { useEffect, useId, useRef, useState } from 'react';
import { Check, Expand, Eye, Save } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { Switch } from '@/components/ui/switch';
import PuzzleSwitcher, { type PuzzleType } from '../cube/PuzzleSwitcher';
import LanguageSwitcher from '../cube/LanguageSwitcher';

export default function WorkspaceHeader({
  puzzle,
  onSwitch,
  autoSave,
  onAutoSave,
  onSave,
  onError,
  locked,
  solving,
  presentation,
  onPresentation,
}: {
  puzzle: PuzzleType;
  onSwitch: (puzzle: PuzzleType) => void;
  autoSave: boolean;
  onAutoSave: (value: boolean) => void;
  onSave: () => void | boolean | Promise<void | boolean>;
  onError: () => void;
  locked: boolean;
  solving: boolean;
  presentation: boolean;
  onPresentation: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const result = await onSave();
      if (!mounted.current || result === false) return;
      setSaved(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 1600);
    } catch {
      if (mounted.current) onError();
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      onError();
    }
  }
  const number =
    puzzle === 'cube'
      ? '03'
      : puzzle === 'pyraminx'
        ? '04'
        : puzzle === 'megaminx'
          ? '12'
          : puzzle.slice(-1).padStart(2, '0');
  return (
    <header className="app-header">
      <div className="brand">
        <PuzzleSwitcher
          value={puzzle}
          onChange={onSwitch}
          disabled={locked || saving}
        />
        <strong>
          AXIS<span>/</span>
          {number}
        </strong>
        <span className="brand-divider" />
        <span className="brand-subtitle">{t('app.name')}</span>
      </div>
      <div className="header-actions">
        <LanguageSwitcher />
        <span className="local-badge">
          <i />
          {t('app.local')}
        </span>
        <div className="autosave-switch">
          <label htmlFor={id}>{t('app.autoSave')}</label>
          <Switch
            id={id}
            aria-label={t('app.autoSave')}
            checked={autoSave}
            onCheckedChange={onAutoSave}
          />
        </div>
        <button
          type="button"
          className="icon-button"
          disabled={locked || saving}
          title={t(saved ? 'app.saved' : 'app.save')}
          aria-label={t(saved ? 'app.saved' : 'app.save')}
          onClick={() => void save()}
        >
          {saved ? <Check size={18} /> : <Save size={18} />}
        </button>
        <button
          type="button"
          className="icon-button"
          title={t('app.fullscreen')}
          aria-label={t('app.fullscreen')}
          onClick={() => void fullscreen()}
        >
          <Expand size={18} />
        </button>
        <button
          type="button"
          className="icon-button presentation-toggle"
          disabled={solving}
          aria-pressed={presentation}
          title={t(presentation ? 'app.exitPresentation' : 'app.presentation')}
          aria-label={t(
            presentation ? 'app.exitPresentation' : 'app.presentation',
          )}
          onClick={() => onPresentation(!presentation)}
        >
          <Eye size={18} />
        </button>
      </div>
    </header>
  );
}

export function WorkspaceFooter({
  mode,
  explode,
}: {
  mode: string;
  explode: number;
}) {
  const { t } = useTranslation();
  return (
    <footer className="app-footer">
      <span>{t('app.name')}</span>
      <span>
        <i className="live-dot" />
        {mode === 'explode'
          ? `${t('mode.explode')} ${explode.toFixed(2)}`
          : t('app.ready')}
      </span>
      <span>{t('app.local')}</span>
    </footer>
  );
}
