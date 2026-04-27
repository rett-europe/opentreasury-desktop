import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import './TagCombinerDropdown.css';

export type TagCombinerOption = {
  readonly id: string;
  readonly name: string;
  readonly color: string;
};

export type TagCombinerDropdownProps = {
  readonly availableTags: ReadonlyArray<TagCombinerOption>;
  readonly selectedIds: ReadonlyArray<string>;
  readonly onAdd: (id: string) => void;
  /** Localized strings — caller wires i18n keys. */
  readonly labels: {
    readonly trigger: string;
    readonly searchPlaceholder: string;
    readonly empty: string;
    readonly listAriaLabel: string;
  };
};

/**
 * Searchable tag combiner per UX-005 spec §5.4.
 * Renders as a dashed-border pill button; click opens a panel with a
 * search input and scrollable list of remaining (not-yet-selected) tags.
 *
 * Accessibility:
 *  - Trigger uses `aria-haspopup="listbox"` and `aria-expanded`.
 *  - Options are role="option" inside role="listbox"; arrow keys navigate;
 *    Enter / Space confirm; Escape closes; Tab returns focus to trigger.
 */
export function TagCombinerDropdown({
  availableTags,
  selectedIds,
  onAdd,
  labels,
}: TagCombinerDropdownProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const remaining = useMemo(
    () => availableTags.filter((t) => !selectedIds.includes(t.id)),
    [availableTags, selectedIds],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return remaining;
    return remaining.filter((t) => t.name.toLowerCase().includes(q));
  }, [remaining, query]);

  // Focus search input when panel opens; reset state when closing.
  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      // Schedule focus after the panel mounts.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    setQuery('');
    return undefined;
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: MouseEvent): void => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const commit = (id: string): void => {
    onAdd(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((idx) => Math.min(idx + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((idx) => Math.max(idx - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[activeIndex];
      if (target) commit(target.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className="ot-tag-combiner">
      <button
        ref={triggerRef}
        type="button"
        className="ot-tag-combiner__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        disabled={remaining.length === 0}
      >
        <Plus size={14} aria-hidden="true" />
        <span>{labels.trigger}</span>
      </button>

      {open ? (
        <div ref={panelRef} className="ot-tag-combiner__panel" role="dialog">
          <label className="ot-tag-combiner__search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder={labels.searchPlaceholder}
              aria-controls={listboxId}
              aria-activedescendant={
                filtered[activeIndex] ? `${listboxId}-${filtered[activeIndex].id}` : undefined
              }
            />
          </label>

          <ul
            id={listboxId}
            role="listbox"
            aria-label={labels.listAriaLabel}
            className="ot-tag-combiner__list"
          >
            {filtered.length === 0 ? (
              <li className="ot-tag-combiner__empty" role="presentation">
                {labels.empty}
              </li>
            ) : (
              filtered.map((tag, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <li
                    key={tag.id}
                    id={`${listboxId}-${tag.id}`}
                    role="option"
                    aria-selected={isActive}
                    className={
                      isActive
                        ? 'ot-tag-combiner__option ot-tag-combiner__option--active'
                        : 'ot-tag-combiner__option'
                    }
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => commit(tag.id)}
                  >
                    <span
                      className="ot-tag-combiner__dot"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden="true"
                    />
                    <span className="ot-tag-combiner__name">{tag.name}</span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
