// ─── Movimientos (transactions list) ─────────────────────────────────

const MovimientosScreen = ({ searchQuery }) => {
  const D = window.OT_DATA;
  const accMap = Object.fromEntries(D.accounts.map(a => [a.id, a]));

  const [accountFilter, setAccountFilter] = React.useState('all');
  const [typeFilter, setTypeFilter]       = React.useState('all');
  const [catFilter, setCatFilter]         = React.useState('all');
  const [monthFilter, setMonthFilter]     = React.useState('all');
  const [uncategorizedOnly, setUncat]     = React.useState(false);
  const [minAmount, setMinAmount]         = React.useState('');
  const [maxAmount, setMaxAmount]         = React.useState('');
  const [selected, setSelected]           = React.useState(new Set());

  const filtered = React.useMemo(() => {
    return D.transactions.filter(t => {
      if (accountFilter !== 'all' && t.account !== accountFilter) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (catFilter !== 'all' && t.cat !== catFilter) return false;
      if (monthFilter !== 'all') {
        const m = new Date(t.date).getMonth() + 1;
        if (String(m) !== monthFilter) return false;
      }
      if (uncategorizedOnly && t.cat) return false;
      if (minAmount !== '' && Math.abs(t.amount) < Number(minAmount)) return false;
      if (maxAmount !== '' && Math.abs(t.amount) > Number(maxAmount)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.desc.toLowerCase().includes(q) &&
            !(t.sub || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [accountFilter, typeFilter, catFilter, monthFilter, uncategorizedOnly, minAmount, maxAmount, searchQuery]);

  const totals = filtered.reduce((acc, t) => {
    if (t.type === 'income') acc.income += t.amount;
    else acc.expense += Math.abs(t.amount);
    return acc;
  }, { income: 0, expense: 0 });
  const net = totals.income - totals.expense;

  const toggleSel = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(t => t.id)));
  };

  const clearFilters = () => {
    setAccountFilter('all'); setTypeFilter('all'); setCatFilter('all');
    setMonthFilter('all'); setUncat(false); setMinAmount(''); setMaxAmount('');
  };
  const hasFilters = accountFilter !== 'all' || typeFilter !== 'all' || catFilter !== 'all' ||
    monthFilter !== 'all' || uncategorizedOnly || minAmount !== '' || maxAmount !== '';

  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Movimientos</h1>
          <div className="subtitle">{filtered.length} de {D.transactions.length} movimientos</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline"><Icon name="download" size={16}/> Exportar</button>
          <button className="btn btn-primary"><Icon name="plus" size={16}/> Nuevo Movimiento</button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="chip-group">
          <button className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>Todos</button>
          <button className={typeFilter === 'income' ? 'active' : ''} onClick={() => setTypeFilter('income')}>Ingresos</button>
          <button className={typeFilter === 'expense' ? 'active' : ''} onClick={() => setTypeFilter('expense')}>Gastos</button>
        </div>

        <div className="filter-input">
          <Icon name="bank" size={14}/>
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
            <option value="all">Todas las cuentas</option>
            {D.accounts.map(a => <option key={a.id} value={a.id}>{a.short}</option>)}
          </select>
        </div>

        <div className="filter-input">
          <Icon name="folder" size={14}/>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="all">Todas las categorías</option>
            {D.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="filter-input">
          <Icon name="calendar" size={14}/>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="all">Todos los meses</option>
            {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>

        <div className="filter-input" style={{ maxWidth: 110 }}>
          <span style={{ color: 'var(--clr-text-muted)', fontSize: 12 }}>min €</span>
          <input type="number" placeholder="0" value={minAmount} onChange={(e)=>setMinAmount(e.target.value)} style={{ width: 60 }}/>
        </div>
        <div className="filter-input" style={{ maxWidth: 110 }}>
          <span style={{ color: 'var(--clr-text-muted)', fontSize: 12 }}>max €</span>
          <input type="number" placeholder="∞" value={maxAmount} onChange={(e)=>setMaxAmount(e.target.value)} style={{ width: 60 }}/>
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--clr-text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={uncategorizedOnly} onChange={(e) => setUncat(e.target.checked)}/>
          Solo sin categorizar
        </label>

        {hasFilters && (
          <button className="btn btn-ghost" onClick={clearFilters} style={{ marginLeft: 'auto' }}>
            <Icon name="x" size={14}/> Limpiar filtros
          </button>
        )}
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '0 4px 12px', color: 'var(--clr-text-secondary)', fontSize: 13 }}>
        <span><span className="small-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ingresos</span> <span className="amount-income" style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>{fmt.eur(totals.income)}</span></span>
        <span><span className="small-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>Gastos</span> <span className="amount-expense" style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>{fmt.eur(totals.expense)}</span></span>
        <span><span className="small-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>Neto</span> <span style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: net >= 0 ? 'var(--clr-income)' : 'var(--clr-expense)' }}>{fmt.eur(net)}</span></span>
        {selected.size > 0 && (
          <span style={{ marginLeft: 'auto', color: 'var(--brand-primary)', fontWeight: 500 }}>
            {selected.size} seleccionados ·
            <button className="btn btn-ghost" style={{ padding: '4px 8px' }}>Categorizar</button>
            <button className="btn btn-ghost" style={{ padding: '4px 8px' }}>Etiquetar</button>
          </span>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tx-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={toggleAll}/>
              </th>
              <th style={{ width: 36 }}></th>
              <th>Fecha</th>
              <th>Cuenta</th>
              <th>Observaciones</th>
              <th>Categoría</th>
              <th>Subcategoría</th>
              <th>Etiquetas</th>
              <th>Estado</th>
              <th className="align-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => {
              const acc = accMap[t.account];
              const cat = t.cat ? D.categories.find(c => c.id === t.cat) : null;
              const tagObjs = (t.tagIds || []).map(id => D.tags.find(x => x.id === id)).filter(Boolean);
              return (
                <tr key={t.id} style={selected.has(t.id) ? { background: 'var(--brand-surface)' } : {}}>
                  <td><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)}/></td>
                  <td><span className={`type-arrow ${t.type}`}>{t.type === 'income' ? '↑' : '↓'}</span></td>
                  <td>{fmt.date(t.date)}</td>
                  <td>
                    <span className="account-pill" style={{ background: `color-mix(in oklch, ${acc.color} 18%, transparent)`, color: 'var(--clr-text-primary)' }}>
                      <span className="dot" style={{ background: acc.color }}/>
                      {acc.short}
                    </span>
                  </td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.desc}</td>
                  <td>{cat ? cat.name : <span className="badge badge-uncategorized">Sin categorizar</span>}</td>
                  <td style={{ color: 'var(--clr-text-muted)' }}>{t.sub || '—'}</td>
                  <td>
                    {tagObjs.length > 0 ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {tagObjs.map(tag => (
                          <span key={tag.id} className="tag-chip" style={{ background: `color-mix(in oklch, ${tag.color} 35%, transparent)` }}>{tag.name}</span>
                        ))}
                      </div>
                    ) : <span className="small-muted">—</span>}
                  </td>
                  <td>
                    {t.status === 'pending'
                      ? <span className="badge badge-pending">Pendiente</span>
                      : <span className="badge badge-approved">Aprobado</span>}
                  </td>
                  <td className={`align-right ${t.type === 'income' ? 'amount-income' : 'amount-expense'}`}>{fmt.eur(t.amount)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 48, textAlign: 'center', color: 'var(--clr-text-muted)' }}>
                No se encontraron movimientos con los filtros actuales.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

Object.assign(window, { MovimientosScreen });
