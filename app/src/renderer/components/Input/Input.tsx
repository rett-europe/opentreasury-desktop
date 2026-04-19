import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import './Input.css';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> {
  readonly label: string;
  readonly helperText?: string;
  readonly errorText?: string;
}

/**
 * Text input with associated label, helper text, and error state.
 * Label is required (Principle P3: never rely on placeholders).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helperText, errorText, required, id, className, disabled, readOnly, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const hasError = typeof errorText === 'string' && errorText.length > 0;

  const describedBy =
    [hasError ? errorId : null, helperText ? helperId : null].filter(Boolean).join(' ') ||
    undefined;

  const wrapperClasses = ['ot-input', hasError ? 'ot-input--error' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClasses}>
      <label className="ot-input__label" htmlFor={inputId}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ot-input__required">
              *
            </span>
            <span className="ot-sr-only"> (required)</span>
          </>
        ) : null}
      </label>
      <input
        ref={ref}
        id={inputId}
        className="ot-input__field"
        disabled={disabled}
        readOnly={readOnly}
        aria-readonly={readOnly ? true : undefined}
        aria-invalid={hasError ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required ? true : undefined}
        {...rest}
      />
      {hasError ? (
        <span id={errorId} className="ot-input__error" role="alert">
          {errorText}
        </span>
      ) : helperText ? (
        <span id={helperId} className="ot-input__helper">
          {helperText}
        </span>
      ) : null}
    </div>
  );
});
