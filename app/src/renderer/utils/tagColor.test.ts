import { describe, it, expect } from 'vitest';
import { getTagColor, TAG_COLORS } from './tagColor.js';

describe('getTagColor', () => {
  it('returns the explicit color when the tag provides one', () => {
    expect(getTagColor({ color: '#abcdef', name: 'whatever' }, 'tag-1')).toBe('#abcdef');
  });

  it('falls back to a palette color hashed from the tag name', () => {
    const color = getTagColor({ name: 'Personal' }, 'tag-1');
    expect(TAG_COLORS).toContain(color as (typeof TAG_COLORS)[number]);
  });

  it('falls back to the id when the tag has no name or color', () => {
    const color = getTagColor(undefined, 'tag-id-xyz');
    expect(TAG_COLORS).toContain(color as (typeof TAG_COLORS)[number]);
  });

  it('is deterministic — same input always yields the same color', () => {
    const a = getTagColor({ name: 'Operations' }, 'tag-x');
    const b = getTagColor({ name: 'Operations' }, 'tag-x');
    expect(a).toBe(b);
  });

  it('ignores name capitalization variance only when it differs (case-sensitive hash)', () => {
    const lower = getTagColor({ name: 'donors' }, 'id');
    const upper = getTagColor({ name: 'Donors' }, 'id');
    // Sanity-check the hash actually depends on the string — same string,
    // same color; different string, may differ. We only assert determinism
    // for the same casing.
    expect(getTagColor({ name: 'donors' }, 'id')).toBe(lower);
    expect(getTagColor({ name: 'Donors' }, 'id')).toBe(upper);
  });
});
