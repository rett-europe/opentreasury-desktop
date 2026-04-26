// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedToggle, type SegmentedToggleOption } from './SegmentedToggle.js';

describe('SegmentedToggle', () => {
  const defaultOptions: SegmentedToggleOption[] = [
    { value: 'volume', label: 'Volumen' },
    { value: 'net', label: 'Neto' },
    { value: 'count', label: '# Mov.' },
  ];

  it('renders all options', () => {
    const onChange = vi.fn();

    render(
      <SegmentedToggle
        options={defaultOptions}
        value="volume"
        onChange={onChange}
        ariaLabel="Display mode"
      />,
    );

    expect(screen.getByLabelText('Volumen')).toBeDefined();
    expect(screen.getByLabelText('Neto')).toBeDefined();
    expect(screen.getByLabelText('# Mov.')).toBeDefined();
  });

  it('marks selected option as checked', () => {
    const onChange = vi.fn();

    render(
      <SegmentedToggle
        options={defaultOptions}
        value="net"
        onChange={onChange}
        ariaLabel="Display mode"
      />,
    );

    const netRadio = screen.getByLabelText('Neto') as HTMLInputElement;
    const volumeRadio = screen.getByLabelText('Volumen') as HTMLInputElement;

    expect(netRadio.checked).toBe(true);
    expect(volumeRadio.checked).toBe(false);
  });

  it('calls onChange when option is clicked', () => {
    const onChange = vi.fn();

    render(
      <SegmentedToggle
        options={defaultOptions}
        value="volume"
        onChange={onChange}
        ariaLabel="Display mode"
      />,
    );

    fireEvent.click(screen.getByLabelText('Neto'));

    expect(onChange).toHaveBeenCalledWith('net');
  });

  it('supports arrow key navigation (right)', () => {
    const onChange = vi.fn();

    render(
      <SegmentedToggle
        options={defaultOptions}
        value="volume"
        onChange={onChange}
        ariaLabel="Display mode"
      />,
    );

    const firstRadio = screen.getByLabelText('Volumen');
    firstRadio.focus();

    fireEvent.keyDown(firstRadio, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('net');
  });

  it('supports arrow key navigation (left)', () => {
    const onChange = vi.fn();

    render(
      <SegmentedToggle
        options={defaultOptions}
        value="net"
        onChange={onChange}
        ariaLabel="Display mode"
      />,
    );

    const secondRadio = screen.getByLabelText('Neto');
    secondRadio.focus();

    fireEvent.keyDown(secondRadio, { key: 'ArrowLeft' });

    expect(onChange).toHaveBeenCalledWith('volume');
  });

  it('wraps around when navigating right at end', () => {
    const onChange = vi.fn();

    render(
      <SegmentedToggle
        options={defaultOptions}
        value="count"
        onChange={onChange}
        ariaLabel="Display mode"
      />,
    );

    const lastRadio = screen.getByLabelText('# Mov.');
    lastRadio.focus();

    fireEvent.keyDown(lastRadio, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('volume');
  });

  it('wraps around when navigating left at start', () => {
    const onChange = vi.fn();

    render(
      <SegmentedToggle
        options={defaultOptions}
        value="volume"
        onChange={onChange}
        ariaLabel="Display mode"
      />,
    );

    const firstRadio = screen.getByLabelText('Volumen');
    firstRadio.focus();

    fireEvent.keyDown(firstRadio, { key: 'ArrowLeft' });

    expect(onChange).toHaveBeenCalledWith('count');
  });

  it('has correct ARIA roles', () => {
    const onChange = vi.fn();

    render(
      <SegmentedToggle
        options={defaultOptions}
        value="volume"
        onChange={onChange}
        ariaLabel="Display mode selector"
      />,
    );

    const radiogroup = screen.getByRole('radiogroup', { name: 'Display mode selector' });
    expect(radiogroup).toBeDefined();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('sets aria-checked correctly', () => {
    const onChange = vi.fn();

    render(
      <SegmentedToggle
        options={defaultOptions}
        value="net"
        onChange={onChange}
        ariaLabel="Display mode"
      />,
    );

    const netRadio = screen.getByLabelText('Neto');
    const volumeRadio = screen.getByLabelText('Volumen');

    expect(netRadio.getAttribute('aria-checked')).toBe('true');
    expect(volumeRadio.getAttribute('aria-checked')).toBe('false');
  });

  it('applies selected class to active option', () => {
    const onChange = vi.fn();

    const { container } = render(
      <SegmentedToggle
        options={defaultOptions}
        value="net"
        onChange={onChange}
        ariaLabel="Display mode"
      />,
    );

    const labels = container.querySelectorAll('.ot-segmented-toggle__option');
    expect(labels[1]?.classList.contains('ot-segmented-toggle__option--selected')).toBe(true);
    expect(labels[0]?.classList.contains('ot-segmented-toggle__option--selected')).toBe(false);
  });
});
