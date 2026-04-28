/**
 * SPEC-024 — HighlightedText Component
 *
 * Renders text with search query matches wrapped in <mark> tags.
 * NEVER uses dangerouslySetInnerHTML — builds React elements safely.
 */

import { useMemo } from 'react';
import { normalize } from '../../search/search.js';

export interface HighlightedTextProps {
  readonly query: string;
  readonly text: string;
}

export function HighlightedText({ query, text }: HighlightedTextProps): JSX.Element {
  const highlighted = useMemo(() => {
    if (!query.trim()) {
      return [text];
    }

    const normalizedText = normalize(text);
    const normalizedQuery = normalize(query);

    // Split query into tokens (simple whitespace split, no quoted phrase handling here)
    const tokens = normalizedQuery.split(/\s+/).filter((t) => t.length > 0);

    if (tokens.length === 0) {
      return [text];
    }

    // Find all match positions
    const matches: Array<{ start: number; end: number }> = [];

    for (const token of tokens) {
      let pos = 0;
      while ((pos = normalizedText.indexOf(token, pos)) !== -1) {
        matches.push({ start: pos, end: pos + token.length });
        pos += token.length;
      }
    }

    if (matches.length === 0) {
      return [text];
    }

    // Sort and merge overlapping matches
    matches.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];

    for (const match of matches) {
      if (merged.length === 0) {
        merged.push(match);
      } else {
        const last = merged[merged.length - 1];
        if (last && match.start <= last.end) {
          // Overlapping or adjacent — extend the last match
          last.end = Math.max(last.end, match.end);
        } else {
          merged.push(match);
        }
      }
    }

    // Build fragments
    const fragments: Array<string | JSX.Element> = [];
    let lastEnd = 0;

    for (let i = 0; i < merged.length; i++) {
      const match = merged[i];
      if (!match) continue;

      // Text before match
      if (match.start > lastEnd) {
        fragments.push(text.substring(lastEnd, match.start));
      }

      // Highlighted match
      fragments.push(
        <mark key={`mark-${i}`} className="ot-search-mark">
          {text.substring(match.start, match.end)}
        </mark>,
      );

      lastEnd = match.end;
    }

    // Text after last match
    if (lastEnd < text.length) {
      fragments.push(text.substring(lastEnd));
    }

    return fragments;
  }, [query, text]);

  return <>{highlighted}</>;
}
