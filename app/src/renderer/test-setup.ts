import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// @tanstack/react-virtual (used by <Table virtualise>) relies on ResizeObserver
// to measure scroll-container dimensions. jsdom does not implement it, so we
// provide a minimal stub that immediately reports a 1000 × 600 viewport.
// This lets virtualised tables render their overscan items in unit tests
// without requiring a real browser layout engine.
class ResizeObserverStub implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.callback(
      [
        {
          target,
          contentRect: new DOMRect(0, 0, 1000, 600),
          borderBoxSize: [{ inlineSize: 1000, blockSize: 600 }],
          contentBoxSize: [{ inlineSize: 1000, blockSize: 600 }],
          devicePixelContentBoxSize: [{ inlineSize: 1000, blockSize: 600 }],
        } as ResizeObserverEntry,
      ],
      this,
    );
  }

  unobserve(): void {}
  disconnect(): void {}
}

(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
