'use client';
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
  return (
    <>
      <Choice
        label="图片适配"
        value={value.fit}
        options={[
          ['fill', '覆盖区域'],
          ['fit', '完整显示'],
          ['crop', '裁切图片'],
        ]}
        onChange={(fit) => onChange({ fit: fit as ArtTransform['fit'] })}
      />
      <Range
        label="缩放"
        value={value.scale}
        min={0.1}
        max={4}
        unit="×"
        onChange={(scale) => onChange({ scale })}
      />
      <Range
        label="水平偏移"
        value={value.x}
        min={-1}
        max={1}
        onChange={(x) => onChange({ x })}
      />
      <Range
        label="垂直偏移"
        value={value.y}
        min={-1}
        max={1}
        onChange={(y) => onChange({ y })}
      />
      <Range
        label="图片旋转"
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
            label="裁切左边界"
            value={value.cropX}
            min={0}
            max={0.95}
            onChange={(cropX) =>
              onChange({ cropX, cropW: Math.min(value.cropW, 1 - cropX) })
            }
          />
          <Range
            label="裁切上边界"
            value={value.cropY}
            min={0}
            max={0.95}
            onChange={(cropY) =>
              onChange({ cropY, cropH: Math.min(value.cropH, 1 - cropY) })
            }
          />
          <Range
            label="裁切宽度"
            value={value.cropW}
            min={0.05}
            max={1 - value.cropX}
            onChange={(cropW) => onChange({ cropW })}
          />
          <Range
            label="裁切高度"
            value={value.cropH}
            min={0.05}
            max={1 - value.cropY}
            onChange={(cropH) => onChange({ cropH })}
          />
        </div>
      )}
      <div className="image-actions">
        <button onClick={() => onChange(defaultTransform())}>
          <RotateCcw size={14} /> 居中重置
        </button>
        <button
          onClick={() =>
            onChange({
              rotation: ((((value.rotation + 270) % 360) + 360) % 360) - 180,
            })
          }
        >
          旋转 90°
        </button>
      </div>
    </>
  );
}
