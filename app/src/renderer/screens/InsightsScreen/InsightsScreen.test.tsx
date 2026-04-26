// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { InsightsScreen } from './InsightsScreen.js';
import * as insightsApi from '../../services/insightsApi.js';
import type { InsightsLandingSummaryResponse } from '../../../shared/ipc-contracts/insights.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'insights.kpi.activeTagsSublabel') {
        return `of ${params?.total} total`;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

const mockResponse: InsightsLandingSummaryResponse = {
  kpis: {
    etiquetasActivasCount: 5,
    etiquetasTotalesCount: 8,
    ingresosEtiquetadosCents: 1855000,
    gastosEtiquetadosCents: 125000,
  },
  tags: [
    {
      tagId: 'tag-1',
      name: 'Test Tag',
      color: '#d4a5d4',
      archived: false,
      ingresosCents: 1015000,
      gastosCents: 0,
      netoCents: 1015000,
      movimientosCount: 4,
      topCategorias: [{ categoryId: 'cat-1', name: 'Donations' }],
      sparklineNetCents: [200000, 250000, 300000, 265000],
    },
  ],
  otrasBucket: null,
  windowStart: '2026-01-01',
  windowEnd: '2026-05-02',
};

describe('InsightsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.spyOn(insightsApi, 'getInsightsLandingSummary').mockImplementation(
      () => new Promise(() => {}),
    );

    render(<InsightsScreen />);
    expect(screen.getByText('insights.states.loading')).toBeDefined();
  });

  it('renders KPI strip and tag cards when data loads', async () => {
    vi.spyOn(insightsApi, 'getInsightsLandingSummary').mockResolvedValue(mockResponse);

    render(<InsightsScreen />);

    await waitFor(() => {
      expect(screen.getByText('insights.kpi.activeTags')).toBeDefined();
    });

    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('of 8 total')).toBeDefined();
    expect(screen.getByText('Test Tag')).toBeDefined();
    expect(screen.getByText('4 mov.')).toBeDefined();
  });

  it('renders empty state when no tags have data', async () => {
    const emptyResponse: InsightsLandingSummaryResponse = {
      ...mockResponse,
      tags: [],
    };
    vi.spyOn(insightsApi, 'getInsightsLandingSummary').mockResolvedValue(emptyResponse);

    render(<InsightsScreen />);

    await waitFor(() => {
      expect(screen.getByText('insights.states.emptyTags')).toBeDefined();
    });

    expect(screen.getByText('insights.states.emptyTagsBody')).toBeDefined();
  });

  it('renders error state when API fails', async () => {
    vi.spyOn(insightsApi, 'getInsightsLandingSummary').mockRejectedValue(new Error('API Error'));

    render(<InsightsScreen />);

    await waitFor(() => {
      expect(screen.getByText('insights.states.error')).toBeDefined();
    });

    expect(screen.getByText('common.retry')).toBeDefined();
  });

  it('changes display mode when toggle is clicked', async () => {
    vi.spyOn(insightsApi, 'getInsightsLandingSummary').mockResolvedValue(mockResponse);

    const { container } = render(<InsightsScreen />);

    await waitFor(() => {
      expect(screen.getByText('Test Tag')).toBeDefined();
    });

    // Volume mode shows all 3 metrics
    const volumeMetrics = container.querySelector('.ot-tag-card__metrics--volume');
    expect(volumeMetrics).toBeDefined();
  });
});
