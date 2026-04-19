import type { ReactNode } from 'react';
import './EmptyState.css';

export interface EmptyStateProps {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly body?: string;
  readonly actions?: ReactNode;
}

/**
 * Empty-state surface per components-v1.md §11. Title is required; body and
 * primary/secondary actions are optional. Icon slot exists but is expected to
 * ship unused at v0.1 (Mouse: zero illustrations, optional Lucide glyph only).
 */
export function EmptyState({ icon, title, body, actions }: EmptyStateProps): JSX.Element {
  return (
    <div className="ot-empty" role="status">
      {icon ? (
        <div className="ot-empty__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 className="ot-empty__title">{title}</h2>
      {body ? <p className="ot-empty__body">{body}</p> : null}
      {actions ? <div className="ot-empty__actions">{actions}</div> : null}
    </div>
  );
}
