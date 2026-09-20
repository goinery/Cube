import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Box, Check, Pyramid } from 'lucide-react';
export type PuzzleType = 'cube' | 'pyraminx';
export default function PuzzleSwitcher({
  value,
  onChange,
  disabled = false,
}: {
  value: PuzzleType;
  onChange: (value: PuzzleType) => void;
  disabled?: boolean;
}) {
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
        aria-label="切换魔方"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <ArrowLeftRight size={17} />
        <span>{value === 'cube' ? '三阶魔方' : '金字塔魔方'}</span>
      </button>
      {open && (
        <div className="puzzle-switch-menu" aria-label="魔方类型">
          {(
            [
              ['cube', '三阶魔方', Box, '3 × 3 × 3'],
              ['pyraminx', '金字塔魔方', Pyramid, 'PYRAMINX'],
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
                <strong>{title}</strong>
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
