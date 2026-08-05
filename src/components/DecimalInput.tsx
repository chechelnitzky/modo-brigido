import { useEffect, useRef, useState, type FocusEvent, type InputHTMLAttributes } from 'react';

type DecimalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode'> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
};

function formatDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/\s/g, '').replace(/[^0-9.,]/g, '');
  const separatorIndex = cleaned.search(/[.,]/);
  if (separatorIndex < 0) return cleaned;
  const integerPart = cleaned.slice(0, separatorIndex);
  const decimalPart = cleaned.slice(separatorIndex + 1).replace(/[.,]/g, '');
  return `${integerPart}${cleaned[separatorIndex]}${decimalPart}`;
}

function parseDecimal(value: string): number | null | undefined {
  if (value === '') return null;
  if (/[.,]$/.test(value)) return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function DecimalInput({ value, onValueChange, onFocus, onBlur, ...props }: DecimalInputProps) {
  const [draft, setDraft] = useState(() => formatDecimal(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(formatDecimal(value));
  }, [value]);

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    focused.current = true;
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    focused.current = false;
    const parsed = parseDecimal(draft);
    if (parsed === null) {
      setDraft('');
      onValueChange(null);
    } else if (parsed !== undefined) {
      setDraft(formatDecimal(parsed));
      onValueChange(parsed);
    } else {
      const fallback = draft.replace(/[.,]$/, '');
      const fallbackParsed = parseDecimal(fallback);
      if (fallbackParsed === null || fallbackParsed === undefined) {
        setDraft(formatDecimal(value));
      } else {
        setDraft(formatDecimal(fallbackParsed));
        onValueChange(fallbackParsed);
      }
    }
    onBlur?.(event);
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      pattern="[0-9]*[.,]?[0-9]*"
      value={draft}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(event) => {
        const next = sanitizeDecimal(event.target.value);
        setDraft(next);
        const parsed = parseDecimal(next);
        if (parsed !== undefined) onValueChange(parsed);
      }}
    />
  );
}
