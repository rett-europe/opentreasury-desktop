import { createElement } from 'react';
import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import './Stack.css';

export type StackDirection = 'row' | 'column';
export type StackGap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type StackAlign = 'start' | 'center' | 'end' | 'stretch';
export type StackJustify = 'start' | 'center' | 'end' | 'between';

export interface StackProps extends HTMLAttributes<HTMLElement> {
  readonly direction?: StackDirection;
  readonly gap?: StackGap;
  readonly align?: StackAlign;
  readonly justify?: StackJustify;
  readonly wrap?: boolean;
  readonly as?: ElementType;
  readonly children?: ReactNode;
}

/**
 * Layout primitive. Maps `gap` to the spacing token scale so callers don't
 * touch raw pixels. Direction defaults to `column` (most common pattern).
 */
export function Stack({
  direction = 'column',
  gap = 3,
  align,
  justify,
  wrap,
  as,
  className,
  style,
  children,
  ...rest
}: StackProps): JSX.Element {
  const Tag: ElementType = as ?? 'div';
  const classes = [
    'ot-stack',
    `ot-stack--${direction}`,
    align ? `ot-stack--align-${align}` : '',
    justify ? `ot-stack--justify-${justify}` : '',
    wrap ? 'ot-stack--wrap' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const mergedStyle: CSSProperties = { gap: `var(--space-${gap})`, ...(style ?? {}) };

  return createElement(Tag, { className: classes, style: mergedStyle, ...rest }, children);
}
