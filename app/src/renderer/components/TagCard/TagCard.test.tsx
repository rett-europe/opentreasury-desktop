// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagCard } from './TagCard.js';
import type { TagCardKPIs } from './TagCard.js';

describe('TagCard', () => {
  const defaultKPIs: TagCardKPIs = {
    ingresos: 1000,
    gastos: 400,
    neto: 600,
    count: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic rendering', () => {
    it('renders tag name and badge', () => {
      render(
        <TagCard
          tagId="tag-1"
          name="Fundraising Campaign"
          kpis={defaultKPIs}
          displayMode="volumen"
        />,
      );

      expect(screen.getByText('Fundraising Campaign')).toBeDefined();
      expect(screen.getByText('5 mov.')).toBeDefined();
    });

    it('renders color dot with provided color', () => {
      const { container } = render(
        <TagCard
          tagId="tag-1"
          name="Test"
          color="rgb(255, 0, 0)"
          kpis={defaultKPIs}
          displayMode="volumen"
        />,
      );

      const colorDot = container.querySelector('.ot-tag-card__color-dot');
      expect(colorDot).toBeDefined();
      expect((colorDot as HTMLElement).style.backgroundColor).toBe('rgb(255, 0, 0)');
    });

    it('uses color hash when no color provided', () => {
      const { container } = render(
        <TagCard tagId="tag-1" name="Test" kpis={defaultKPIs} displayMode="volumen" />,
      );

      const colorDot = container.querySelector('.ot-tag-card__color-dot');
      expect(colorDot).toBeDefined();
      expect((colorDot as HTMLElement).style.backgroundColor).toMatch(/oklch/);
    });
  });

  describe('Display modes', () => {
    it('shows all three metrics in volumen mode', () => {
      render(<TagCard tagId="tag-1" name="Test" kpis={defaultKPIs} displayMode="volumen" />);

      const normalizedMatcher = (expected: string) => (text: string | null) => {
        if (!text) return false;
        return text.replace(/\u00a0/g, ' ') === expected.replace(/\u00a0/g, ' ');
      };

      expect(screen.getByText('INGRESOS')).toBeDefined();
      expect(screen.getByText('GASTOS')).toBeDefined();
      expect(screen.getByText('NETO')).toBeDefined();
      expect(screen.getByText(normalizedMatcher('1000,00 €'))).toBeDefined();
      expect(screen.getByText(normalizedMatcher('400,00 €'))).toBeDefined();
      expect(screen.getByText(normalizedMatcher('600,00 €'))).toBeDefined();
    });

    it('shows only neto in neto mode', () => {
      render(<TagCard tagId="tag-1" name="Test" kpis={defaultKPIs} displayMode="neto" />);

      expect(screen.getByText('NETO')).toBeDefined();
      expect(screen.getByText('600,00 €')).toBeDefined();
      expect(screen.queryByText('INGRESOS')).toBeNull();
      expect(screen.queryByText('GASTOS')).toBeNull();
    });

    it('shows movement count in mov mode', () => {
      render(<TagCard tagId="tag-1" name="Test" kpis={defaultKPIs} displayMode="mov" />);

      expect(screen.getByText('# MOVIMIENTOS')).toBeDefined();
      expect(screen.getByText('5')).toBeDefined();
      expect(screen.queryByText('INGRESOS')).toBeNull();
    });
  });

  describe('Archived styling', () => {
    it('applies archived class and shows label', () => {
      const { container } = render(
        <TagCard
          tagId="tag-1"
          name="Archived Tag"
          kpis={defaultKPIs}
          displayMode="volumen"
          archived={true}
        />,
      );

      expect(container.querySelector('.ot-tag-card--archived')).toBeDefined();
      expect(screen.getByText('(archivada)')).toBeDefined();
    });

    it('includes archived status in aria-label', () => {
      const { container } = render(
        <TagCard
          tagId="tag-1"
          name="Archived Tag"
          kpis={defaultKPIs}
          displayMode="volumen"
          archived={true}
        />,
      );

      const card = container.querySelector('.ot-tag-card');
      expect(card?.getAttribute('aria-label')).toContain('(archivada)');
    });
  });

  describe('Top categorías', () => {
    it('renders top categories when provided', () => {
      render(
        <TagCard
          tagId="tag-1"
          name="Test"
          kpis={defaultKPIs}
          displayMode="volumen"
          topCategorias={[
            { categoryId: 'cat-1', name: 'Donations' },
            { categoryId: 'cat-2', name: 'Events' },
          ]}
        />,
      );

      expect(screen.getByText('Top categorías:')).toBeDefined();
      expect(screen.getByText('Donations, Events')).toBeDefined();
    });

    it('hides footer when no categories', () => {
      render(<TagCard tagId="tag-1" name="Test" kpis={defaultKPIs} displayMode="volumen" />);

      expect(screen.queryByText('Top categorías:')).toBeNull();
    });
  });

  describe('Clickability', () => {
    it('is clickable when onClick provided', () => {
      const handleClick = vi.fn();

      const { container } = render(
        <TagCard
          tagId="tag-1"
          name="Test"
          kpis={defaultKPIs}
          displayMode="volumen"
          onClick={handleClick}
        />,
      );

      const card = container.querySelector('.ot-tag-card');
      expect(card?.classList.contains('ot-tag-card--clickable')).toBe(true);
      expect(card?.getAttribute('role')).toBe('button');
      expect(card?.getAttribute('tabIndex')).toBe('0');

      fireEvent.click(card!);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('responds to keyboard activation (Enter)', () => {
      const handleClick = vi.fn();

      const { container } = render(
        <TagCard
          tagId="tag-1"
          name="Test"
          kpis={defaultKPIs}
          displayMode="volumen"
          onClick={handleClick}
        />,
      );

      const card = container.querySelector('.ot-tag-card');
      card!.focus();
      fireEvent.keyDown(card!, { key: 'Enter' });
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('responds to keyboard activation (Space)', () => {
      const handleClick = vi.fn();

      const { container } = render(
        <TagCard
          tagId="tag-1"
          name="Test"
          kpis={defaultKPIs}
          displayMode="volumen"
          onClick={handleClick}
        />,
      );

      const card = container.querySelector('.ot-tag-card');
      card!.focus();
      fireEvent.keyDown(card!, { key: ' ' });
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('is not clickable when onClick not provided', () => {
      const { container } = render(
        <TagCard tagId="tag-1" name="Test" kpis={defaultKPIs} displayMode="volumen" />,
      );

      const card = container.querySelector('.ot-tag-card');
      expect(card?.classList.contains('ot-tag-card--clickable')).toBe(false);
      expect(card?.getAttribute('role')).toBeNull();
      expect(card?.getAttribute('tabIndex')).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('provides descriptive aria-label', () => {
      const { container } = render(
        <TagCard tagId="tag-1" name="Campaign 2026" kpis={defaultKPIs} displayMode="volumen" />,
      );

      const card = container.querySelector('.ot-tag-card');
      const ariaLabel = card?.getAttribute('aria-label');
      const normalized = ariaLabel?.replace(/\u00a0/g, ' ') || '';
      expect(normalized).toBe('Campaign 2026: 5 movimientos, neto 600,00 €');
    });

    it('includes negative neto in aria-label', () => {
      const negativeKPIs: TagCardKPIs = { ...defaultKPIs, neto: -200 };
      const { container } = render(
        <TagCard tagId="tag-1" name="Test" kpis={negativeKPIs} displayMode="volumen" />,
      );

      const card = container.querySelector('.ot-tag-card');
      const ariaLabel = card?.getAttribute('aria-label');
      const normalized = ariaLabel?.replace(/\u00a0/g, ' ') || '';
      expect(normalized).toContain('-200,00 €');
    });
  });

  describe('Color coding', () => {
    it('applies income color to positive neto', () => {
      render(<TagCard tagId="tag-1" name="Test" kpis={defaultKPIs} displayMode="neto" />);

      const netoValue = screen.getByText('600,00 €');
      expect(netoValue.classList.contains('ot-tag-card__metric-value--income')).toBe(true);
    });

    it('applies expense color to negative neto', () => {
      const negativeKPIs: TagCardKPIs = { ...defaultKPIs, neto: -200 };
      render(<TagCard tagId="tag-1" name="Test" kpis={negativeKPIs} displayMode="neto" />);

      const netoValue = screen.getByText('-200,00 €');
      expect(netoValue.classList.contains('ot-tag-card__metric-value--expense')).toBe(true);
    });
  });
});
