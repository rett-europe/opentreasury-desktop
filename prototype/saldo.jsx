// ─── Saldo (balance / year-over-year) screen ─────────────────────────

const CompareRow = ({ label, sub, y2025, y2026, maxVal, type }) => {
  const color = type === 'income' ? 'var(--clr-income)' : 'var(--clr-expense)';
  const prevWidth = (y2025 / maxVal) * 100;
  const currWidth = (y2026 / maxVal) * 100;
  // Normalize 2026 to full-year projection for delta (partial year ×3 for Q1+Apr ≈ 4 months out of 12)
  const projected = y2026 * 3;
  const delta = ((projected - y2025) / y2025) * 100;
  return (
    <div className="compare-bar">
      <div>
        <div className="cb-label">{label}</div>
        {sub && <div className="cb-sub">{sub}</div>}
      </div>

      <div>
        <div className="cb-value">{fmt.eur0(y2025)}</div>
        <div className="cb-track" style={{ marginTop: 4 }}>
          <div className="cb-fill" style={{ width: `${prevWidth}%`, background: color, opacity: 0.4 }}/>
        </div>
      </div>

      <div>
        <div className="cb-value" style={{ color }}>{fmt.eur0(y2026)}</div>
        <div className="cb-track" style={{ marginTop: 4 }}>
          <div className="cb-fill" style={{ width: `${currWidth}%`, background: color }}/>
        </div>
      </div>

      <div className="cb-delta">
        <div className={delta > 3 ? 'delta-up' : delta < -3 ? 'delta-down' : 'delta-flat'}>
          {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta).toFixed(0)}%
        </div>
        <div className="small-muted" style={{ fontSize: 10 }}>proy. vs 2025</div>
      </div>
    </div>
  );
};

const YearComparePanel = ({ title, rows, maxVal, type }) => (
  <div className="card" style={{ padding: '20px 24px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 'var(--font-lg)', fontWeight: 'var(--fw-semibold)', color: 'var(--clr-text-primary)' }}>{title}</div>
        <div className="small-muted">Comparación por categoría</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="small-muted">Total {type === 'income' ? 'ingresos' : 'gastos'} 2026</div>
        <div style={{ fontSize: 'var(--font-lg)', fontWeight: 'var(--fw-semibold)', color: type === 'income' ? 'var(--clr-income)' : 'var(--clr-expense)', fontVariantNumeric: 'tabular-nums' }}>
          {fmt.eur0(rows.reduce((s, r) => s + r.y2026, 0))}
        </div>
      </div>
    </div>

    <div className="yoy-head">
      <span>Categoría</span>
      <span>2025</span>
      <span>2026 <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--clr-text-disabled)' }}>(ene–abr)</span></span>
      <span>Δ</span>
    </div>
    <div>
      {rows.map((r, i) => (
        <CompareRow key={i} label={r.cat} sub={r.type} y2025={r.y2025} y2026={r.y2026} maxVal={maxVal} type={type}/>
      ))}
    </div>
  </div>
);

const NetComparisonChart = ({ monthly }) => {
  // separate 2025 vs 2026
  const y2025 = Array(12).fill(0);
  const y2026 = Array(12).fill(0);
  monthly.forEach(m => {
    const net = m.income - m.expense;
    if (m.y === 2025) y2025[m.m-1] = net;
    if (m.y === 2026) y2026[m.m-1] = net;
  });
  const max = Math.max(...y2025, ...y2026, 1);
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 'var(--fw-semibold)' }}>Saldo neto mensual</div>
          <div className="small-muted">Diferencia ingresos − gastos · 2025 vs 2026</div>
        </div>
        <div className="legend">
          <span><span className="legend-dot" style={{ background: 'var(--brand-primary-muted)' }}/>2025</span>
          <span><span className="legend-dot" style={{ background: 'var(--brand-primary)' }}/>2026</span>
        </div>
      </div>
      <div className="bar-chart" style={{ height: 170 }}>
        {months.map((label, i) => (
          <div className="bar-col" key={label} style={{ flexDirection: 'row', alignItems: 'end', gap: 2 }}>
            <div className="bar" style={{ width: '50%', height: `${(y2025[i]/max)*100}%`, background: 'var(--brand-primary-muted)' }} title={`2025 ${fmt.eur0(y2025[i])}`}/>
            <div className="bar" style={{ width: '50%', height: `${(y2026[i]/max)*100}%`, background: 'var(--brand-primary)' }} title={`2026 ${fmt.eur0(y2026[i])}`}/>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        {months.map(m => <div key={m} className="bar-month" style={{ flex: 1, fontSize: 10, color: 'var(--clr-text-muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m}</div>)}
      </div>
    </div>
  );
};

const SaldoScreen = () => {
  const D = window.OT_DATA;
  const income  = D.yearlyByCat.filter(r => r.type === 'income');
  const expense = D.yearlyByCat.filter(r => r.type === 'expense');
  const maxIncome = Math.max(...income.map(r => Math.max(r.y2025, r.y2026)));
  const maxExpense = Math.max(...expense.map(r => Math.max(r.y2025, r.y2026)));

  const totalIncome2025 = income.reduce((s, r) => s + r.y2025, 0);
  const totalIncome2026 = income.reduce((s, r) => s + r.y2026, 0);
  const totalExpense2025 = expense.reduce((s, r) => s + r.y2025, 0);
  const totalExpense2026 = expense.reduce((s, r) => s + r.y2026, 0);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Saldo</h1>
          <div className="subtitle">Vista comparativa de ingresos y gastos por categoría</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="segmented">
            <button>Mes</button>
            <button>Trimestre</button>
            <button className="active">Año</button>
          </div>
          <div className="filter-input">
            <Icon name="calendar" size={14}/>
            <span style={{ fontWeight: 500 }}>2025 vs 2026</span>
          </div>
          <button className="btn btn-outline"><Icon name="download" size={16}/> Exportar</button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="kpi-strip" style={{ marginBottom: 24 }}>
        <div className="card kpi">
          <div className="kpi-icon" style={{ background: 'var(--clr-income-bg)', color: 'var(--clr-income)' }}>
            <Icon name="trend" size={20} stroke={2}/>
          </div>
          <div>
            <div className="kpi-label">Ingresos totales</div>
            <div className="kpi-value" style={{ color: 'var(--clr-income)' }}>{fmt.eur0(totalIncome2026)}</div>
            <div className="kpi-delta">2025: {fmt.eur0(totalIncome2025)} · proy. 2026: {fmt.eur0(totalIncome2026 * 3)}</div>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-icon" style={{ background: 'var(--clr-expense-bg)', color: 'var(--clr-expense)' }}>
            <Icon name="trendDown" size={20} stroke={2}/>
          </div>
          <div>
            <div className="kpi-label">Gastos totales</div>
            <div className="kpi-value" style={{ color: 'var(--clr-expense)' }}>{fmt.eur0(totalExpense2026)}</div>
            <div className="kpi-delta">2025: {fmt.eur0(totalExpense2025)} · proy. 2026: {fmt.eur0(totalExpense2026 * 3)}</div>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-icon" style={{ background: 'var(--brand-surface)', color: 'var(--brand-primary)' }}>
            <Icon name="calculator" size={20} stroke={2}/>
          </div>
          <div>
            <div className="kpi-label">Saldo neto</div>
            <div className="kpi-value" style={{ color: 'var(--brand-primary)' }}>{fmt.eur0(totalIncome2026 - totalExpense2026)}</div>
            <div className="kpi-delta">2025: {fmt.eur0(totalIncome2025 - totalExpense2025)}</div>
          </div>
        </div>
      </div>

      <NetComparisonChart monthly={D.monthly}/>

      <div style={{ height: 16 }}/>

      <div className="saldo-grid">
        <YearComparePanel title="Ingresos"  rows={income}  maxVal={maxIncome}  type="income"/>
        <YearComparePanel title="Gastos"    rows={expense} maxVal={maxExpense} type="expense"/>
      </div>
    </div>
  );
};

// ─── Placeholder screen for unbuilt routes ───────────────────────────
const PlaceholderScreen = ({ route }) => {
  const labels = {
    categorias: 'Categorías', etiquetas: 'Etiquetas', cuentas: 'Cuentas',
    importacion: 'Importación', exportar: 'Exportar',
  };
  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>{labels[route]}</h1>
          <div className="subtitle">Pantalla no incluida en este prototipo</div>
        </div>
      </div>
      <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--clr-text-muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>◇</div>
        <div style={{ fontSize: 15, maxWidth: 400, margin: '0 auto' }}>
          Este prototipo se centra en <strong>Panel</strong>, <strong>Movimientos</strong> y <strong>Saldo</strong>.
          El resto de las vistas están fuera del alcance aquí.
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SaldoScreen, PlaceholderScreen });
