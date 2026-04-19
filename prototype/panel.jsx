// ─── Panel (Dashboard) screen ────────────────────────────────────────

const Sparkline = ({ values, color, height = 28 }) => {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 160;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polygon points={`0,${height} ${pts} ${w},${height}`} fill={color} opacity="0.12"/>
    </svg>
  );
};

const AccountCard = ({ acc, spark }) => {
  const negative = acc.balance < 0;
  const amountClass = negative ? 'amount-expense' : 'amount-income';
  return (
    <div className="card hoverable account-card">
      <div className="ac-head">
        <div className="ac-icon" style={{ background: acc.color }}>
          <Icon name="bank" size={18} stroke={2}/>
        </div>
        <div>
          <div className="ac-name">{acc.short}</div>
          <div className="ac-count">{acc.count} movimiento(s)</div>
        </div>
      </div>
      <div className={`ac-balance ${amountClass}`}>{fmt.eur(acc.balance)}</div>
      <div className="ac-spark">
        <Sparkline values={spark} color={acc.color}/>
      </div>
    </div>
  );
};

const KpiCard = ({ label, value, icon, tone }) => {
  const tones = {
    income:  { bg: 'var(--clr-income-bg)',   fg: 'var(--clr-income)' },
    expense: { bg: 'var(--clr-expense-bg)',  fg: 'var(--clr-expense)' },
    net:     { bg: 'var(--brand-surface)',   fg: 'var(--brand-primary)' },
  };
  const t = tones[tone] || tones.net;
  return (
    <div className="card kpi">
      <div className="kpi-icon" style={{ background: t.bg, color: t.fg }}>
        <Icon name={icon} size={20} stroke={2}/>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value" style={{ color: t.fg }}>{fmt.eur(value)}</div>
        <div className="kpi-delta">Mes actual · Abril 2026</div>
      </div>
    </div>
  );
};

const MonthlyBars = ({ data }) => {
  const last12 = data.slice(-12);
  const max = Math.max(...last12.map(m => Math.max(m.income, m.expense)));
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return (
    <div>
      <div className="bar-chart">
        {last12.map((m, i) => (
          <div className="bar-col" key={`${m.y}-${m.m}`}>
            <div className="bar income"  style={{ height: `${(m.income/max)*100}%` }} title={`Ingresos ${fmt.eur0(m.income)}`}/>
            <div className="bar expense" style={{ height: `${(m.expense/max)*100}%` }} title={`Gastos ${fmt.eur0(m.expense)}`}/>
            <div className="bar-month">{months[m.m-1]}</div>
          </div>
        ))}
      </div>
      <div className="legend" style={{ marginTop: 12 }}>
        <span><span className="legend-dot" style={{ background: 'var(--clr-income)' }}/>Ingresos</span>
        <span><span className="legend-dot" style={{ background: 'var(--clr-expense)' }}/>Gastos</span>
      </div>
    </div>
  );
};

const RecentTxTable = ({ txs, accounts, setRoute }) => {
  const accMap = Object.fromEntries(accounts.map(a => [a.id, a]));
  const shown = txs.slice(0, 8);
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table className="tx-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}></th>
            <th>Fecha</th>
            <th>Cuenta</th>
            <th>Observaciones</th>
            <th>Categoría</th>
            <th>Subcategoría</th>
            <th className="align-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(t => {
            const acc = accMap[t.account];
            const cat = t.cat ? window.OT_DATA.categories.find(c => c.id === t.cat) : null;
            return (
              <tr key={t.id}>
                <td><span className={`type-arrow ${t.type}`}>{t.type === 'income' ? '↑' : '↓'}</span></td>
                <td>{fmt.date(t.date)}</td>
                <td>
                  <span className="account-pill" style={{ background: `color-mix(in oklch, ${acc.color} 18%, transparent)`, color: 'var(--clr-text-primary)' }}>
                    <span className="dot" style={{ background: acc.color }}/>
                    {acc.short}
                  </span>
                </td>
                <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.desc}</td>
                <td>{cat ? cat.name : <span className="badge badge-uncategorized">Sin categorizar</span>}</td>
                <td style={{ color: 'var(--clr-text-muted)' }}>{t.sub || '—'}</td>
                <td className={`align-right ${t.type === 'income' ? 'amount-income' : 'amount-expense'}`}>{fmt.eur(t.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--clr-divider)' }}>
        <button className="btn btn-ghost" onClick={() => setRoute('movimientos')}>Ver todos los movimientos →</button>
      </div>
    </div>
  );
};

const PanelScreen = ({ setRoute }) => {
  const D = window.OT_DATA;
  // fake sparklines per account
  const spark = (seed) => {
    const arr = [];
    let v = 50 + (seed * 13 % 30);
    for (let i = 0; i < 12; i++) {
      v += ((seed * 7 + i * 3) % 11) - 5;
      arr.push(v);
    }
    return arr;
  };
  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Panel</h1>
          <div className="subtitle">19 de abril, 2026 · Vista general del mes</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline"><Icon name="calendar" size={16}/> Abril 2026</button>
          <button className="btn btn-primary"><Icon name="plus" size={16}/> Nuevo Movimiento</button>
        </div>
      </div>

      <div className="section-label">Saldos por cuenta</div>
      <div className="account-cards">
        {D.accounts.map((a, i) => (
          <AccountCard key={a.id} acc={a} spark={spark(i+1)}/>
        ))}
      </div>

      <div className="section-label">Resumen del mes</div>
      <div className="kpi-strip">
        <KpiCard label="Ingresos" value={D.monthSummary.income}  icon="trend"      tone="income"/>
        <KpiCard label="Gastos"   value={D.monthSummary.expense} icon="trendDown"  tone="expense"/>
        <KpiCard label="Neto"     value={D.monthSummary.net}     icon="calculator" tone="net"/>
      </div>

      <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Ingresos vs. Gastos · Últimos 12 meses</span>
      </div>
      <div className="card" style={{ padding: '16px 20px' }}>
        <MonthlyBars data={D.monthly}/>
      </div>

      <div className="section-label">Últimos movimientos</div>
      <RecentTxTable txs={D.transactions} accounts={D.accounts} setRoute={setRoute}/>
    </div>
  );
};

Object.assign(window, { PanelScreen, Sparkline, MonthlyBars });
