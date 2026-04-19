import { createElement } from 'react';
import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import './Text.css';

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'body-strong'
  | 'small'
  | 'caption'
  | 'micro';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info';

export interface TextProps extends HTMLAttributes<HTMLElement> {
  readonly variant?: TextVariant;
  readonly tone?: TextTone;
  readonly as?: ElementType;
  readonly children?: ReactNode;
  readonly tabular?: boolean;
}

const DEFAULT_TAG: Record<TextVariant, ElementType> = {
  display: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  body: 'p',
  'body-strong': 'p',
  small: 'span',
  caption: 'span',
  micro: 'span',
};

/**
 * Typographic wrapper — see docs/design/tokens.md §2. Renders a semantic tag
 * appropriate for the variant by default; override with `as` when needed.
 */
export function Text({
  variant = 'body',
  tone,
  as,
  className,
  children,
  tabular,
  ...rest
}: TextProps): JSX.Element {
  const Tag: ElementType = as ?? DEFAULT_TAG[variant];
  const classes = [
    'ot-text',
    `ot-text--${variant}`,
    tone ? `ot-text--${tone}` : '',
    tabular ? 'ot-tnum' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return createElement(Tag, { className: classes, ...rest }, children);
}
