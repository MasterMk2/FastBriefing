import { useId } from 'react';
import type { ReactNode } from 'react';

/**
 * Labelled form row (SPEC 5.1 F13). The label sits above the control; a unit
 * belongs in the label text. A reason for being disabled is shown under the control.
 */
export interface FieldProps {
  label: string;
  children: (id: string) => ReactNode;
  hint?: string;
  disabledReason?: string;
}

export function Field({ label, children, hint, disabledReason }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="field-hint" id={hintId}>{hint}</p>}
      {disabledReason && <p className="field-reason">{disabledReason}</p>}
    </div>
  );
}
