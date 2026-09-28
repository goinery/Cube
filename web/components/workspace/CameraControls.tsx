import { Expand,Focus,Move3D } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { PuzzleSettings } from '@/puzzles/config';
import { Choice,Range,Toggle } from './Controls';
export function EasingControl({value, onChange, disabled}: {value: PuzzleSettings['easing']; onChange: (easing: PuzzleSettings['easing']) => void; disabled?: boolean}) {
  const {t} = useTranslation();
  return <Choice label={t('motion.easing')} value={value} disabled={disabled} options={(['magnetic','smooth','linear'] as const).map((q) => [q,t(`motion.${q}`)])} onChange={(q) => onChange(q as PuzzleSettings['easing'])}/>;
}
export default function CameraControls({value, onChange, actions, onPresentation, disabled = false, limits}: {
  value: PuzzleSettings; onChange: (update: Partial<PuzzleSettings>) => void;
  actions: {reset: () => void; fit: () => void; focus: () => void}; onPresentation: () => void; disabled?: boolean;
  limits: {roughness: [number,number]; elevation: [number,number]; intensity: number};
}) {
  const {t} = useTranslation();
  return <>
    <button className="wide-button" disabled={disabled} onClick={() => actions.reset()}>{t('camera.reset')}<Move3D size={18}/></button>
    <button className="wide-button" disabled={disabled} onClick={() => actions.focus()}>{t('camera.focus')}<Focus size={18}/></button>
    <button className="wide-button" disabled={disabled} onClick={() => actions.fit()}>{t('camera.fit')}<Focus size={18}/></button>
    <button className="wide-button" disabled={disabled} onClick={onPresentation}>{t('app.presentation')}<Expand size={16}/></button>
    <Toggle label={t('camera.auto')} value={value.autoRotate} disabled={disabled} onChange={(autoRotate) => onChange({autoRotate})}/>
    <Range label={t('camera.roughness')} value={value.roughness} min={limits.roughness[0]} max={limits.roughness[1]} disabled={disabled} onChange={(roughness) => onChange({roughness})}/>
    <section className="panel-section"><h3>{t('camera.light')}</h3>
      <Toggle label={t('camera.follow')} value={value.lightFollowCamera} disabled={disabled} onChange={(lightFollowCamera) => onChange({lightFollowCamera})}/>
      <Range label={t('camera.azimuth')} value={value.lightAzimuth} min={-180} max={180} step={1} digits={0} unit="°" disabled={disabled} onChange={(lightAzimuth) => onChange({lightAzimuth})}/>
      <Range label={t('camera.elevation')} value={value.lightElevation} min={limits.elevation[0]} max={limits.elevation[1]} step={1} digits={0} unit="°" disabled={disabled} onChange={(lightElevation) => onChange({lightElevation})}/>
      <Range label={t('camera.intensity')} value={value.lightIntensity} min={0} max={limits.intensity} disabled={disabled} onChange={(lightIntensity) => onChange({lightIntensity})}/>
    </section>
    <Choice label={t('camera.quality')} value={value.quality} disabled={disabled} options={(['auto','high','low'] as const).map((q) => [q,t(q === 'auto' ? 'camera.adaptive' : `camera.${q}`)])} onChange={(quality) => onChange({quality: quality as PuzzleSettings['quality']})}/>
    <EasingControl value={value.easing} disabled={disabled} onChange={(easing) => onChange({easing})}/>
  </>;
}
