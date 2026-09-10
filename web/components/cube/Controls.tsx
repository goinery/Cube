'use client';
import { useEffect, useId, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { notify } from '@/lib/cube/store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
export function Range({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  unit = '',
  digits = 2,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  digits?: number;
  disabled?: boolean;
}) {
  const id = useId(),
    [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  function commit(raw: string) {
    const text = raw.trim().replace(/[^0-9.eE+-]+$/, '');
    const parsed = text ? Number(text) : NaN;
    if (!Number.isFinite(parsed)) {
      notify(`「${label}」需要填写数字。`);
      setDraft(null);
      return;
    }
    const next = Math.min(max, Math.max(min, parsed));
    if (next !== parsed)
      notify(
        `「${label}」的范围是 ${min}${unit} – ${max}${unit}，已按界限取值。`,
      );
    setDraft(null);
    onChange(next);
  }
  return (
    <div className="range-control">
      <div className="control-label">
        <label id={id}>{label}</label>
        <span className="value-input">
          <input
            type="text"
            inputMode="decimal"
            aria-labelledby={id}
            disabled={disabled}
            value={draft ?? value.toFixed(digits)}
            onFocus={(e) => {
              setDraft(value.toFixed(digits));
              e.currentTarget.select();
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commit(e.currentTarget.value);
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setDraft(null);
                e.currentTarget.blur();
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const from = draft === null ? value : Number(draft);
                const base = Number.isFinite(from) ? from : value;
                const next = Math.min(
                  max,
                  Math.max(min, base + (e.key === 'ArrowUp' ? step : -step)),
                );
                setDraft(null);
                onChange(next);
              }
            }}
          />
          {unit && <i>{unit}</i>}
        </span>
      </div>
      <Slider
        disabled={disabled}
        aria-labelledby={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
    </div>
  );
}
export function Toggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="toggle-control">
      <label htmlFor={id}>{label}</label>
      <Switch
        id={id}
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="choice-control">
      <label id={id}>{label}</label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger aria-labelledby={id}>
          <SelectValue>{options.find((o) => o[0] === value)?.[1]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
