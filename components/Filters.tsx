'use client';

export function Chips<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} className={`chip ${o.value === value ? 'active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}{o.count != null && <span className="chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
