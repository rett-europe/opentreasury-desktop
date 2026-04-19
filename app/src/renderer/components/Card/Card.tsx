import type { HTMLAttributes, ReactNode } from 'react';
import './Card.css';

export type CardPadding = 'sm' | 'md' | 'lg' | 'none';
export type CardTone = 'default' | 'subtle';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly padding?: CardPadding;
  readonly tone?: CardTone;
  readonly flat?: boolean;
  readonly children?: ReactNode;
}

/**
 * Surface container. Cards are semantic by default (`<section>`-ish) — callers
 * supply `aria-label` / heading when the card stands alone.
 */
export function Card({
  padding = 'md',
  tone = 'default',
  flat = false,
  className,
  children,
  ...rest
}: CardProps): JSX.Element {
  const classes = [
    'ot-card',
    padding !== 'none' ? `ot-card--pad-${padding}` : '',
    tone === 'subtle' ? 'ot-card--subtle' : '',
    flat ? 'ot-card--flat' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
