import { useTranslation } from '@/lib/i18n';
import type { ImageTransform } from '@/lib/workspace/images';
import { Range } from './Controls';
export default function ImageControls({value, onChange}: {value: ImageTransform; onChange: (update: Partial<ImageTransform>) => void}) {
  const {t} = useTranslation();
  return <>
    <Range label={t('art.scale')} value={value.scale} min={0.1} max={8} unit="×" onChange={(scale) => onChange({scale})}/>
    <Range label={t('art.x')} value={value.x} min={-2} max={2} onChange={(x) => onChange({x})}/>
    <Range label={t('art.y')} value={value.y} min={-2} max={2} onChange={(y) => onChange({y})}/>
    <Range label={t('art.rotation')} value={value.rotation} min={-180} max={180} step={1} digits={0} unit="°" onChange={(rotation) => onChange({rotation})}/>
  </>;
}
