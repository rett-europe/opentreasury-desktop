import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
  readonly children?: ReactNode;
}

/**
 * Button — see docs/design/components-v1.md §1.
 * Uses forwardRef so parents can focus it (e.g. empty-state primary CTAs).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    leadingIcon,
    trailingIcon,
    disabled,
    className,
    children,
    type,
    ...rest
  },
  ref,
) {
  const classes = [
    'ot-button',
    `ot-button--${variant}`,
    `ot-button--${size}`,
    loading ? 'ot-button--loading' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const isDisabled = disabled === true || loading;

  return (
    <button
      ref={ref}
      // `type` defaults to "button" — never accidentally submits a form.
      type={type ?? 'button'}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {loading ? (
        <span className="ot-button__spinner" aria-hidden="true" />
      ) : leadingIcon ? (
        <span aria-hidden="true">{leadingIcon}</span>
      ) : null}
      <span className="ot-button__label">{children}</span>
      {!loading && trailingIcon ? <span aria-hidden="true">{trailingIcon}</span> : null}
    </button>
  );
});
