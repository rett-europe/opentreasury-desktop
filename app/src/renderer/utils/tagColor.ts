/**
 * Tag color palette + deterministic fallback hash, shared between
 * `TransactionsTable` and `TransactionDetailModal` so the two surfaces
 * never drift.
 *
 * If the tag has an explicit `color`, that wins. Otherwise we hash the
 * tag's display name (falling back to its id) into the palette so the
 * same tag always gets the same color across screens.
 */

export const TAG_COLORS = [
  '#9b72cf',
  '#4e8bd6',
  '#e06b6b',
  '#6ca974',
  '#d6a94e',
  '#b06bd6',
] as const;

export interface TagLike {
  readonly color?: string | null;
  readonly name?: string | null;
}

export function getTagColor(tag: TagLike | undefined, fallbackId: string): string {
  if (tag?.color) return tag.color;
  const key = tag?.name ?? fallbackId;
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return TAG_COLORS[h % TAG_COLORS.length] as string;
}
