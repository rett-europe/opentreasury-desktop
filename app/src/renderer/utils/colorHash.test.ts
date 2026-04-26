import { describe, it, expect } from 'vitest';
import { categoryColor, otherBucketColor } from './colorHash.js';

describe('colorHash', () => {
  describe('categoryColor', () => {
    it('returns the same color for the same ID', () => {
      const color1 = categoryColor('cat-123');
      const color2 = categoryColor('cat-123');
      expect(color1).toBe(color2);
    });

    it('returns oklch format', () => {
      const color = categoryColor('test-id');
      expect(color).toMatch(/^oklch\(/);
    });

    it('returns different colors for different IDs', () => {
      const color1 = categoryColor('cat-1');
      const color2 = categoryColor('cat-2');
      const color3 = categoryColor('cat-3');

      // At least 2 should be different (collision possible but unlikely)
      const uniqueColors = new Set([color1, color2, color3]);
      expect(uniqueColors.size).toBeGreaterThan(1);
    });

    it('distributes across the palette', () => {
      const colors = new Set<string>();
      for (let i = 0; i < 100; i++) {
        colors.add(categoryColor(`cat-${i}`));
      }
      // With 8 colors in palette, 100 IDs should hit at least 7 of them
      expect(colors.size).toBeGreaterThanOrEqual(7);
    });
  });

  describe('otherBucketColor', () => {
    it('returns a neutral color', () => {
      const color = otherBucketColor();
      expect(color).toMatch(/^oklch\(/);
      expect(color).toContain('0.02'); // low chroma
    });

    it('returns the same color every time', () => {
      expect(otherBucketColor()).toBe(otherBucketColor());
    });
  });
});
