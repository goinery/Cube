import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Box, Check, Pyramid } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
export type PuzzleType =
  | 'cube'
  | 'pyraminx'
  | 'cube-2'
  | 'cube-4'
  | 'cube-5'
  | 'megaminx';
export default function PuzzleSwitcher({
  value,
  onChange,
  disabled = false,
}: {
  value: PuzzleType;
  onChange: (value: PuzzleType) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false),
    host = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function outside(e: PointerEvent) {
      if (!host.current?.contains(e.target as Node)) setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div className="puzzle-switcher" ref={host}>
      <button
        ref={trigger}
        className="puzzle-switch-trigger"
        aria-label={t('app.switch')}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <ArrowLeftRight size={17} />
        <span>{t(`puzzle.${value}`)}</span>
      </button>
      {open && (
        <div className="puzzle-switch-menu" aria-label={t('app.type')}>
          {(
            [
              ['cube-2', 'cube-2', Box, '2 × 2 × 2'],
              ['cube', 'cube', Box, '3 × 3 × 3'],
              ['cube-4', 'cube-4', Box, '4 × 4 × 4'],
              ['cube-5', 'cube-5', Box, '5 × 5 × 5'],
              ['megaminx', 'megaminx', Box, 'MEGAMINX'],
              ['pyraminx', 'pyraminx', Pyramid, 'PYRAMINX'],
            ] as const
          ).map(([id, title, Icon, subtitle]) => (
            <button
              key={id}
              aria-pressed={value === id}
              onClick={() => {
                setOpen(false);
                if (value !== id) onChange(id);
              }}
            >
              <Icon size={22} />
              <span>
                <strong>{t(`puzzle.${title}`)}</strong>
                <small>{subtitle}</small>
              </span>
              {value === id && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
