'use client';
import { tx, useLanguage } from '@/lib/i18n';
import { RotateCcw } from 'lucide-react';
import { defaultTransform, type ArtTransform } from '@/lib/cube/appearance';
import { Choice, Range } from './Controls';
export default function ImageTransformControls({
  value,
  onChange,
}: {
  value: ArtTransform;
  onChange: (update: Partial<ArtTransform>) => void;
}) {
  useLanguage();
  return (
    <>
      <Choice
        label={tx('legacy.m217')}
        value={value.fit}
        options={[
          ['fill', tx('legacy.m218')],
          ['fit', tx('legacy.m219')],
          ['crop', tx('legacy.m220')],
        ]}
        onChange={(fit) => onChange({ fit: fit as ArtTransform['fit'] })}
      />
      <Range
        label={tx('legacy.m221')}
        value={value.scale}
        min={0.1}
        max={4}
        unit="×"
        onChange={(scale) => onChange({ scale })}
      />
      <Range
        label={tx('legacy.m222')}
        value={value.x}
        min={-1}
        max={1}
        onChange={(x) => onChange({ x })}
      />
      <Range
        label={tx('legacy.m223')}
        value={value.y}
        min={-1}
        max={1}
        onChange={(y) => onChange({ y })}
      />
      <Range
        label={tx('legacy.m224')}
        value={value.rotation}
        min={-180}
        max={180}
        step={1}
        digits={0}
        unit="°"
        onChange={(rotation) => onChange({ rotation })}
      />
      {value.fit === 'crop' && (
        <div className="crop-controls">
          <Range
            label={tx('legacy.m225')}
            value={value.cropX}
            min={0}
            max={0.95}
            onChange={(cropX) =>
              onChange({ cropX, cropW: Math.min(value.cropW, 1 - cropX) })
            }
          />
          <Range
            label={tx('legacy.m226')}
            value={value.cropY}
            min={0}
            max={0.95}
            onChange={(cropY) =>
              onChange({ cropY, cropH: Math.min(value.cropH, 1 - cropY) })
            }
          />
          <Range
            label={tx('legacy.m227')}
            value={value.cropW}
            min={0.05}
            max={1 - value.cropX}
            onChange={(cropW) => onChange({ cropW })}
          />
          <Range
            label={tx('legacy.m228')}
            value={value.cropH}
            min={0.05}
            max={1 - value.cropY}
            onChange={(cropH) => onChange({ cropH })}
          />
        </div>
      )}
      <div className="image-actions">
        <button onClick={() => onChange(defaultTransform())}>
          <RotateCcw size={14} />
          {tx('legacy.m229')}
        </button>
        <button
          onClick={() =>
            onChange({
              rotation: ((((value.rotation + 270) % 360) + 360) % 360) - 180,
            })
          }
        >
          {tx('legacy.m230')}
        </button>
      </div>
    </>
  );
}
