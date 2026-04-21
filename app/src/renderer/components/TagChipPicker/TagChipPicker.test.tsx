// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagChipPicker } from './TagChipPicker.js';

describe('TagChipPicker', () => {
  const mockTags = [
    { id: '1', name: 'Urgent' },
    { id: '2', name: 'Personal' },
    { id: '3', name: 'Work' },
  ];

  it('renders all available tags as chips', () => {
    render(<TagChipPicker availableTags={mockTags} selectedIds={[]} onToggle={vi.fn()} />);

    expect(screen.getByText('Urgent')).toBeDefined();
    expect(screen.getByText('Personal')).toBeDefined();
    expect(screen.getByText('Work')).toBeDefined();
  });

  it('marks selected tags with pressed state', () => {
    render(<TagChipPicker availableTags={mockTags} selectedIds={['1', '3']} onToggle={vi.fn()} />);

    const urgentChip = screen.getByRole('button', { name: /Urgent/i });
    const personalChip = screen.getByRole('button', { name: /Personal/i });
    const workChip = screen.getByRole('button', { name: /Work/i });

    expect(urgentChip.getAttribute('aria-pressed')).toBe('true');
    expect(personalChip.getAttribute('aria-pressed')).toBe('false');
    expect(workChip.getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onToggle when chip is clicked', () => {
    const handleToggle = vi.fn();

    render(<TagChipPicker availableTags={mockTags} selectedIds={[]} onToggle={handleToggle} />);

    const personalChip = screen.getByRole('button', { name: /Personal/i });
    fireEvent.click(personalChip);

    expect(handleToggle).toHaveBeenCalledWith('2');
  });

  it('allows toggling selection without modifier keys', () => {
    const handleToggle = vi.fn();

    render(<TagChipPicker availableTags={mockTags} selectedIds={['1']} onToggle={handleToggle} />);

    // Click selected chip to unselect
    const urgentChip = screen.getByRole('button', { name: /Urgent/i });
    fireEvent.click(urgentChip);
    expect(handleToggle).toHaveBeenCalledWith('1');

    // Click unselected chip to select
    const workChip = screen.getByRole('button', { name: /Work/i });
    fireEvent.click(workChip);
    expect(handleToggle).toHaveBeenCalledWith('3');
  });

  it('disables chips when disabled prop is true', () => {
    render(
      <TagChipPicker
        availableTags={mockTags}
        selectedIds={[]}
        onToggle={vi.fn()}
        disabled={true}
      />,
    );

    const chips = screen.getAllByRole('button');
    chips.forEach((chip) => {
      expect((chip as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('shows empty message when no tags available', () => {
    render(<TagChipPicker availableTags={[]} selectedIds={[]} onToggle={vi.fn()} />);

    expect(screen.getByText('No tags available')).toBeDefined();
  });
});
