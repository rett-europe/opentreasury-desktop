// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { BulkActionsBar } from './BulkActionsBar.js';

function renderBar(props: Partial<React.ComponentProps<typeof BulkActionsBar>> = {}) {
  const onClassify = props.onClassify ?? vi.fn();
  const onApprove = props.onApprove;
  const onAddLabel = props.onAddLabel;
  const onCancel = props.onCancel ?? vi.fn();
  const selectedCount = props.selectedCount ?? 0;
  return {
    onClassify,
    onApprove,
    onAddLabel,
    onCancel,
    ...render(
      <I18nextProvider i18n={i18n}>
        <BulkActionsBar
          selectedCount={selectedCount}
          onClassify={onClassify}
          onApprove={onApprove}
          onAddLabel={onAddLabel}
          onCancel={onCancel}
        />
      </I18nextProvider>,
    ),
  };
}

describe('BulkActionsBar', () => {
  it('renders nothing when selectedCount is 0', () => {
    renderBar({ selectedCount: 0 });
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('renders a region with the bulk actions aria-label when selection is non-empty', () => {
    renderBar({ selectedCount: 3 });
    const region = screen.getByRole('region', { name: /bulk actions|acciones en lote/i });
    expect(region).not.toBeNull();
  });

  it('renders a pluralised count label', () => {
    renderBar({ selectedCount: 5 });
    // The visible pill + the aria-live region both render the same label,
    // so a regex match is sufficient.
    expect(screen.getAllByText(/5 transactions selected/i).length).toBeGreaterThan(0);
  });

  it('renders the singular count label when selectedCount is 1', () => {
    renderBar({ selectedCount: 1 });
    expect(screen.getAllByText(/1 transaction selected/i).length).toBeGreaterThan(0);
  });

  it('invokes onClassify when the primary button is clicked', () => {
    const { onClassify } = renderBar({ selectedCount: 2 });
    fireEvent.click(screen.getByRole('button', { name: /classify|clasificar/i }));
    expect(onClassify).toHaveBeenCalledTimes(1);
  });

  it('invokes onCancel (and not onClassify) when the ghost Cancel button is clicked', () => {
    const { onCancel, onClassify } = renderBar({ selectedCount: 2 });
    fireEvent.click(screen.getByRole('button', { name: /^cancel(ar)?$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClassify).not.toHaveBeenCalled();
  });

  it('hides the Approve button when onApprove is not provided', () => {
    renderBar({ selectedCount: 2 });
    expect(screen.queryByRole('button', { name: /^(approve|aprobar)$/i })).toBeNull();
  });

  it('renders the Approve button and invokes onApprove when clicked', () => {
    const onApprove = vi.fn();
    renderBar({ selectedCount: 3, onApprove });
    const btn = screen.getByRole('button', { name: /^(approve|aprobar)$/i });
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('does not render the Approve button when selectedCount is 0', () => {
    const onApprove = vi.fn();
    renderBar({ selectedCount: 0, onApprove });
    expect(screen.queryByRole('button', { name: /^(approve|aprobar)$/i })).toBeNull();
  });

  it('hides the AddLabel button when onAddLabel is not provided', () => {
    renderBar({ selectedCount: 2 });
    expect(screen.queryByRole('button', { name: /label…|etiquetar…/i })).toBeNull();
  });

  it('renders the AddLabel button and invokes onAddLabel when clicked', () => {
    const onAddLabel = vi.fn();
    renderBar({ selectedCount: 4, onAddLabel });
    const btn = screen.getByRole('button', { name: /label…|etiquetar…/i });
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(onAddLabel).toHaveBeenCalledTimes(1);
  });
});
