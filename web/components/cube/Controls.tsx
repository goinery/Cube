'use client';
import { useId } from 'react';
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  digits?: number;
}) {
  const id = useId();
  return (
    <div className="range-control">
      <div className="control-label">
        <label id={id}>{label}</label>
        <output>
          {value.toFixed(digits)}
          {unit}
        </output>
      </div>
      <Slider
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
