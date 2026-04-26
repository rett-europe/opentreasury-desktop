/**
 * Deterministic color hashing for category visualization.
 * Maps a string ID to a stable oklch color from a curated palette.
 *
 * The palette is chosen for visual distinction + WCAG AA contrast on light bg.
 */

const PALETTE_OKLCH = [
  'oklch(0.55 0.15 270)', // purple
  'oklch(0.60 0.18 200)', // blue
  'oklch(0.65 0.14 150)', // teal
  'oklch(0.60 0.12 130)', // green
  'oklch(0.70 0.14 80)', // yellow-green
  'oklch(0.65 0.16 40)', // orange
  'oklch(0.60 0.18 20)', // red-orange
  'oklch(0.55 0.12 340)', // pink
] as const;

const NEUTRAL_COLOR = 'oklch(0.60 0.02 260)'; // low-chroma gray for "Otras"

/**
 * Simple FNV-1a hash (32-bit). Fast, good distribution for short strings.
 */
function hash32(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0; // unsigned
}

/**
 * Returns a stable color for a given category ID.
 * Same ID always maps to the same color.
 */
export function categoryColor(categoryId: string): string {
  const idx = hash32(categoryId) % PALETTE_OKLCH.length;
  return PALETTE_OKLCH[idx]!;
}

/**
 * Returns a neutral color for the "Otras" (other) bucket in charts.
 */
export function otherBucketColor(): string {
  return NEUTRAL_COLOR;
}
