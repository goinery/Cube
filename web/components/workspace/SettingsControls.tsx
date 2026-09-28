import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { assemblyDefaults, type PuzzleSettings, type StudioPuzzleId } from '@/puzzles/config';
import { Range, Toggle } from './Controls';

type SettingsProps = {
  value: PuzzleSettings;
  onChange: (patch: Partial<PuzzleSettings>) => void;
  disabled?: boolean;
};

export function MagneticControls({ value, onChange, disabled, maxAngle, children }: SettingsProps & {
  maxAngle: number;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="panel-section magnetic-controls">
      <div className="section-head">
        <h3>{t('motion.title')}</h3>
        <span className="tag">{t(value.magnetStrength === 0 ? 'legacy.m075' : 'legacy.m076')}</span>
      </div>
      <Range label={t('motion.strength')} value={value.magnetStrength} min={0} max={2} step={0.05} disabled={disabled} onChange={(magnetStrength) => onChange({ magnetStrength })} />
      <Range label={t('motion.damping')} value={value.magnetDamping} min={0.05} max={2} step={0.05} disabled={disabled} onChange={(magnetDamping) => onChange({ magnetDamping })} />
      <Range label={t('motion.tolerance')} value={value.turnTolerance} min={0} max={maxAngle} step={1} digits={0} unit="°" disabled={disabled} onChange={(turnTolerance) => onChange({ turnTolerance })} />
      {children}
    </section>
  );
}

export function AssemblyControls({ value, onChange, disabled, puzzle, onExplode, onReset, limits = {} }: SettingsProps & {
  puzzle: StudioPuzzleId;
  onExplode?: () => void;
  onReset: () => void;
  limits?: { internal?: number; gap?: number; gapStep?: number; size?: number; stickerOffset?: number };
}) {
  const { t } = useTranslation();
  function explode(amount: number) {
    onChange({ explode: amount });
    onExplode?.();
  }
  return (
    <>
      <Range label={t('explode.amount')} value={value.explode} min={0} max={3} disabled={disabled} onChange={explode} />
      <div className="explode-presets">
        {['assembled', 'pieces', 'structure', 'complete'].map((label, index) => (
          <button key={label} disabled={disabled} className={Math.abs(value.explode - index) < 0.03 ? 'active' : ''} onClick={() => explode(index)}>{t('explode.' + label)}</button>
        ))}
      </div>
      <Range label={t('explode.internal')} value={value.internal} min={0} max={limits.internal ?? 1.5} disabled={disabled} onChange={(internal) => onChange({ internal })} />
      <Range label={t('explode.gap')} value={value.gap} min={0} max={limits.gap ?? 0.3} step={limits.gapStep ?? 0.001} digits={3} disabled={disabled} onChange={(gap) => onChange({ gap })} />
      <Range label={t('explode.size')} value={value.size} min={0.65} max={limits.size ?? 1.08} disabled={disabled} onChange={(size) => onChange({ size })} />
      <Range label={t('explode.offset')} value={value.stickerOffset} min={0} max={limits.stickerOffset ?? 0.2} disabled={disabled} onChange={(stickerOffset) => onChange({ stickerOffset })} />
      <Toggle label={t('explode.magnets')} value={value.showMagnets} disabled={disabled} onChange={(showMagnets) => onChange({ showMagnets })} />
      <button className="wide-button" disabled={disabled} onClick={() => { onChange(assemblyDefaults(puzzle)); onReset(); }}>
        {t('explode.assemble')}<RotateCcw size={16} />
      </button>
    </>
  );
}
