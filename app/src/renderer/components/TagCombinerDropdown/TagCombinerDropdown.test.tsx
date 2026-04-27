// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TagCombinerDropdown } from './TagCombinerDropdown.js';

const labels = {
  trigger: '+ Combinar etiqueta',
  searchPlaceholder: 'Buscar…',
  empty: 'Sin coincidencias',
  listAriaLabel: 'Etiquetas disponibles',
};

const tags = [
  { id: 'tag-a', name: 'Campaña A', color: '#a33' },
  { id: 'tag-b', name: 'Beca', color: '#3a3' },
  { id: 'tag-c', name: 'Concierto', color: '#33a' },
];

describe('TagCombinerDropdown', () => {
  it('hides already-selected tags from the list', () => {
    render(
      <TagCombinerDropdown
        availableTags={tags}
        selectedIds={['tag-a']}
        onAdd={() => {}}
        labels={labels}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /combinar/i }));
    expect(screen.queryByText('Campaña A')).toBeNull();
    expect(screen.getByText('Beca')).toBeDefined();
    expect(screen.getByText('Concierto')).toBeDefined();
  });

  it('filters by search query (case-insensitive)', () => {
    render(
      <TagCombinerDropdown
        availableTags={tags}
        selectedIds={[]}
        onAdd={() => {}}
        labels={labels}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /combinar/i }));
    const search = screen.getByPlaceholderText('Buscar…');
    fireEvent.change(search, { target: { value: 'CAM' } });
    expect(screen.getByText('Campaña A')).toBeDefined();
    expect(screen.queryByText('Beca')).toBeNull();
  });

  it('invokes onAdd and closes on selection', () => {
    const onAdd = vi.fn();
    render(
      <TagCombinerDropdown availableTags={tags} selectedIds={[]} onAdd={onAdd} labels={labels} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /combinar/i }));
    fireEvent.click(screen.getByText('Beca'));
    expect(onAdd).toHaveBeenCalledWith('tag-b');
    // Panel should be closed -> listbox no longer in document.
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('disables the trigger when there are no remaining tags to add', () => {
    render(
      <TagCombinerDropdown
        availableTags={tags}
        selectedIds={tags.map((t) => t.id)}
        onAdd={() => {}}
        labels={labels}
      />,
    );
    const button = screen.getByRole('button', { name: /combinar/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
