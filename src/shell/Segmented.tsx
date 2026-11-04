/**
 * Two-to-four choice shown as a button group. The pressed option is marked with
 * aria-pressed and a border, so the current value is readable without colour.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Segmented<T extends string>({ label, options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={`segmented${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {options.map(option => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`segmented-option${pressed ? ' is-pressed' : ''}`}
            aria-pressed={pressed}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
