import { categoryColor } from '../../utils/colorHash.js';
import { useFormatters } from '../../format/index.js';
import './TagCard.css';

export type TagCardDisplayMode = 'volumen' | 'neto' | 'mov';

export type TagCardKPIs = {
  readonly ingresos: number; // EUR
  readonly gastos: number; // EUR
  readonly neto: number; // EUR (signed)
  readonly count: number; // number of movements
};

export type TagCardProps = {
  readonly tagId: string;
  readonly name: string;
  readonly color?: string;
  readonly kpis: TagCardKPIs;
  readonly displayMode: TagCardDisplayMode;
  readonly archived?: boolean;
  readonly topCategorias?: readonly { categoryId: string; name: string }[];
  readonly onClick?: () => void;
};

/**
 * Horizontal tag card for Insights landing page.
 * Shows tag metrics with color dot, badge, and responsive metric display.
 * Supports 3 display modes (Volumen/Neto/# Mov.) and archived styling.
 */
export function TagCard({
  tagId,
  name,
  color,
  kpis,
  displayMode,
  archived = false,
  topCategorias = [],
  onClick,
}: TagCardProps) {
  const { formatCurrency, formatNumber } = useFormatters();
  const formattedCount = formatNumber(kpis.count, { maximumFractionDigits: 0 });
  const resolvedColor = color ?? categoryColor(tagId);
  const isClickable = !!onClick;

  const handleClick = () => {
    if (onClick) onClick();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  const ariaLabel = archived
    ? `${name} (archivada): ${formattedCount} movimientos, neto ${formatCurrency(kpis.neto, 'EUR')}`
    : `${name}: ${formattedCount} movimientos, neto ${formatCurrency(kpis.neto, 'EUR')}`;

  return (
    <div
      className={`ot-tag-card ${archived ? 'ot-tag-card--archived' : ''} ${isClickable ? 'ot-tag-card--clickable' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={ariaLabel}
    >
      {/* Header: color dot + name + badge */}
      <div className="ot-tag-card__header">
        <span className="ot-tag-card__color-dot" style={{ backgroundColor: resolvedColor }} />
        <span className="ot-tag-card__name" title={name}>
          {name}
          {archived && <span className="ot-tag-card__archived-label"> (archivada)</span>}
        </span>
        <span className="ot-tag-card__badge">{formattedCount} mov.</span>
      </div>

      {/* Metrics row: varies by display mode */}
      <div className="ot-tag-card__metrics">
        {displayMode === 'volumen' && (
          <>
            <div className="ot-tag-card__metric">
              <span className="ot-tag-card__metric-label">INGRESOS</span>
              <span className="ot-tag-card__metric-value ot-tag-card__metric-value--income">
                {formatCurrency(kpis.ingresos, 'EUR')}
              </span>
            </div>
            <div className="ot-tag-card__metric">
              <span className="ot-tag-card__metric-label">GASTOS</span>
              <span className="ot-tag-card__metric-value ot-tag-card__metric-value--expense">
                {formatCurrency(kpis.gastos, 'EUR')}
              </span>
            </div>
            <div className="ot-tag-card__metric">
              <span className="ot-tag-card__metric-label">NETO</span>
              <span
                className={`ot-tag-card__metric-value ${kpis.neto >= 0 ? 'ot-tag-card__metric-value--income' : 'ot-tag-card__metric-value--expense'}`}
              >
                {formatCurrency(kpis.neto, 'EUR')}
              </span>
            </div>
          </>
        )}

        {displayMode === 'neto' && (
          <div className="ot-tag-card__metric ot-tag-card__metric--hero">
            <span className="ot-tag-card__metric-label">NETO</span>
            <span
              className={`ot-tag-card__metric-value ot-tag-card__metric-value--hero ${kpis.neto >= 0 ? 'ot-tag-card__metric-value--income' : 'ot-tag-card__metric-value--expense'}`}
            >
              {formatCurrency(kpis.neto, 'EUR')}
            </span>
          </div>
        )}

        {displayMode === 'mov' && (
          <div className="ot-tag-card__metric ot-tag-card__metric--hero">
            <span className="ot-tag-card__metric-label"># MOVIMIENTOS</span>
            <span className="ot-tag-card__metric-value ot-tag-card__metric-value--hero">
              {formattedCount}
            </span>
          </div>
        )}
      </div>

      {/* Footer: top categorías */}
      {topCategorias.length > 0 && (
        <div className="ot-tag-card__footer">
          <span className="ot-tag-card__footer-label">Top categorías: </span>
          <span className="ot-tag-card__footer-value">
            {topCategorias.map((c) => c.name).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
