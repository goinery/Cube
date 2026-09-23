'use client';
import { tx, useLanguage } from '@/lib/i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

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
  useLanguage();
  const [error, setError] = useState('');
  const id = useId(),
    [draft, setDraft] = useState<string | null>(null),
    hostRef = useRef<HTMLDivElement>(null),
    [epoch, setEpoch] = useState(0);
  useEffect(() => setDraft(null), [value]);
  // 边对齐滑块在挂载时测量一次轨道位置。手机与横屏下的面板初始为 display:none，
  // 此时测不到宽度，轨道与滑块会一直隐藏；容器重新可见时重挂载一次以重新测量。
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    let shown = host.offsetWidth > 0;
    const observer = new ResizeObserver(() => {
      const visible = host.offsetWidth > 0;
      if (visible && !shown) setEpoch((n) => n + 1);
      shown = visible;
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  function commit(raw: string) {
    const text = raw.trim().replace(/[^0-9.eE+-]+$/, '');
    const parsed = text ? Number(text) : NaN;
    if (!Number.isFinite(parsed)) {
      setError(tx('legacy.m026', { p0: label }));
      setDraft(null);
      return;
    }
    const next = Math.min(max, Math.max(min, parsed));
    setError(
      next !== parsed
        ? tx('legacy.m027', { p0: label, p1: min, p2: unit, p3: max, p4: unit })
        : '',
    );
    setDraft(null);
    onChange(next);
  }
  return (
    <div className="range-control" ref={hostRef}>
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
      {error && (
        <p role="status" className="range-input-error">
          {error}
        </p>
      )}
      <Slider
        key={epoch}
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
  useLanguage();
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
  useLanguage();
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
