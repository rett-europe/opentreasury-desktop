// ─── Configuration screens: Cuentas, Categorías, Etiquetas ──────────
// Prototype-only UI for issue #1. Reuses the existing design system
// (tokens + primitives: card, btn, chip-group, filter-input, tx-table,
// badge, page-header, section-label, list-row, etc.) — no new tokens.

// ═══════════════════════════════════════════════════════════════════
//  Cuentas
// ═══════════════════════════════════════════════════════════════════
const CuentasScreen = () => {
  const D = window.OT_DATA;
  const [query, setQuery] = React.useState('');

  const rows = D.accounts.filter(a => {
    if (!query) return true;
    const q = query.toLowerCase();
    return a.short.toLowerCase().includes(q) ||
           a.bank.toLowerCase().includes(q)  ||
           (a.label || '').toLowerCase().includes(q) ||
           (a.iban || '').toLowerCase().includes(q);
  });

  const totalBalance = D.accounts.reduce((s, a) => s + a.balance, 0);
  const totalTx      = D.accounts.reduce((s, a) => s + a.count,   0);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Cuentas</h1>
          <div className="subtitle">
            {D.accounts.length} cuenta(s) · {totalTx} movimiento(s) · Saldo total&nbsp;
            <span style={{ fontWeight: 'var(--fw-semibold)', color: totalBalance >= 0 ? 'var(--clr-income)' : 'var(--clr-expense)' }}>
              {fmt.eur(totalBalance)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline"><Icon name="download" size={16}/> Exportar</button>
          <button className="btn btn-primary"><Icon name="plus" size={16}/> Nueva cuenta</button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-input grow">
          <Icon name="search" size={14}/>
          <input
            placeholder="Buscar por nombre, banco, etiqueta o IBAN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="small-muted" style={{ marginLeft: 'auto' }}>
          {rows.length} de {D.accounts.length}
        </span>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tx-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}></th>
              <th>Nombre</th>
              <th>Banco</th>
              <th>Etiqueta</th>
              <th>IBAN</th>
              <th className="align-right">Movimientos</th>
              <th className="align-right">Saldo</th>
              <th style={{ width: 88 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(a => {
              const negative = a.balance < 0;
              return (
                <tr key={a.id}>
                  <td>
                    <div className="entity-icon" style={{ background: a.color }}>
                      <Icon name="bank" size={16} stroke={2}/>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 'var(--fw-medium)', color: 'var(--clr-text-primary)' }}>
                      {a.short}
                    </div>
                    <div className="small-muted">{a.isPaypal ? 'Plataforma externa' : 'Cuenta bancaria'}</div>
                  </td>
                  <td>{a.bank}</td>
                  <td>
                    <span className="account-pill" style={{ background: `color-mix(in oklch, ${a.color} 18%, transparent)` }}>
                      <span className="dot" style={{ background: a.color }}/>
                      {a.label}
                    </span>
                  </td>
                  <td>
                    {a.iban
                      ? <span className="code-mono">{a.iban}</span>
                      : <span className="small-muted">—</span>}
                  </td>
                  <td className="align-right">{a.count}</td>
                  <td className={`align-right ${negative ? 'amount-expense' : 'amount-income'}`}>
                    {fmt.eur(a.balance)}
                  </td>
                  <td>
                    <div style={{ display: 'inline-flex', gap: 2 }}>
                      <button className="row-action" title="Editar"><Icon name="edit" size={14}/></button>
                      <button className="row-action danger" title="Eliminar"><Icon name="trash" size={14}/></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 48, textAlign: 'center', color: 'var(--clr-text-muted)' }}>
                Ninguna cuenta coincide con la búsqueda.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
//  Categorías (master-detail with subcategories)
// ═══════════════════════════════════════════════════════════════════
const CategoriasScreen = () => {
  const D = window.OT_DATA;

  const [typeFilter, setTypeFilter] = React.useState('all');
  const [query, setQuery]           = React.useState('');

  const filtered = D.categories.filter(c => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false;
    if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const [selectedId, setSelectedId] = React.useState(() => D.categories[0]?.id);
  // If the filter hides the current selection, fall back to the first visible
  // category without owning extra state for it — avoids stale-closure effects.
  const selected =
    filtered.find(c => c.id === selectedId) ||
    filtered[0] ||
    null;

  const usageByCat = React.useMemo(() => {
    const map = {};
    D.transactions.forEach(t => { if (t.cat) map[t.cat] = (map[t.cat] || 0) + 1; });
    return map;
  }, []);
  const usageBySub = React.useMemo(() => {
    const map = {};
    D.transactions.forEach(t => {
      if (t.cat && t.sub) {
        const k = `${t.cat}::${t.sub}`;
        map[k] = (map[k] || 0) + 1;
      }
    });
    return map;
  }, []);

  const counts = {
    all:     D.categories.length,
    income:  D.categories.filter(c => c.type === 'income').length,
    expense: D.categories.filter(c => c.type === 'expense').length,
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Categorías</h1>
          <div className="subtitle">
            {counts.all} categorías ·&nbsp;
            <span style={{ color: 'var(--clr-income)' }}>{counts.income} ingresos</span> ·&nbsp;
            <span style={{ color: 'var(--clr-expense)' }}>{counts.expense} gastos</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline"><Icon name="download" size={16}/> Exportar</button>
          <button className="btn btn-primary"><Icon name="plus" size={16}/> Nueva categoría</button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="chip-group">
          <button className={typeFilter === 'all' ? 'active' : ''}     onClick={() => setTypeFilter('all')}>Todas</button>
          <button className={typeFilter === 'income' ? 'active' : ''}  onClick={() => setTypeFilter('income')}>Ingresos</button>
          <button className={typeFilter === 'expense' ? 'active' : ''} onClick={() => setTypeFilter('expense')}>Gastos</button>
        </div>
        <div className="filter-input grow">
          <Icon name="search" size={14}/>
          <input
            placeholder="Buscar categoría…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="master-detail">
        {/* ─── Master: categories list ─── */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div>
              <div className="ch-title">Categorías</div>
              <div className="ch-sub">{filtered.length} resultado(s)</div>
            </div>
          </div>
          <div className="list-rows">
            {filtered.map(c => {
              const uses = usageByCat[c.id] || 0;
              return (
                <div
                  key={c.id}
                  className={`list-row ${selectedId === c.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <Icon name="folder" size={16}/>
                  <div className="lr-main">
                    <div className="lr-title">{c.name}</div>
                    <div className="lr-sub">
                      {c.subs.length} subcategoría(s) · {uses} movimiento(s)
                    </div>
                  </div>
                  <span className={`type-pill ${c.type}`}>
                    {c.type === 'income' ? 'Ingreso' : 'Gasto'}
                  </span>
                  <span className="lr-actions">
                    <button className="row-action" title="Editar" onClick={(e) => e.stopPropagation()}>
                      <Icon name="edit" size={14}/>
                    </button>
                    <button className="row-action danger" title="Eliminar" onClick={(e) => e.stopPropagation()}>
                      <Icon name="trash" size={14}/>
                    </button>
                  </span>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--clr-text-muted)' }}>
                Ninguna categoría coincide.
              </div>
            )}
          </div>
          <div className="list-add">
            <Icon name="plus" size={14}/> Nueva categoría
          </div>
        </div>

        {/* ─── Detail: subcategories of selected category ─── */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {selected ? (
            <>
              <div className="card-head">
                <div>
                  <div className="ch-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {selected.name}
                    <span className={`type-pill ${selected.type}`}>
                      {selected.type === 'income' ? 'Ingreso' : 'Gasto'}
                    </span>
                  </div>
                  <div className="ch-sub">
                    {selected.subs.length} subcategoría(s) ·&nbsp;
                    {usageByCat[selected.id] || 0} movimiento(s) clasificados
                  </div>
                </div>
                <div style={{ display: 'inline-flex', gap: 4 }}>
                  <button className="btn btn-outline"><Icon name="edit" size={14}/> Renombrar</button>
                  <button className="btn btn-soft"><Icon name="plus" size={14}/> Subcategoría</button>
                </div>
              </div>

              <div className="list-rows">
                {selected.subs.map(sub => {
                  const uses = usageBySub[`${selected.id}::${sub}`] || 0;
                  return (
                    <div key={sub} className="list-row">
                      <span className="swatch round" style={{ background: 'var(--brand-primary-light)', border: 'none' }}/>
                      <div className="lr-main">
                        <div className="lr-title">{sub}</div>
                        <div className="lr-sub">{uses} movimiento(s)</div>
                      </div>
                      <span className="lr-actions">
                        <button className="row-action" title="Editar"><Icon name="edit" size={14}/></button>
                        <button className="row-action danger" title="Eliminar"><Icon name="trash" size={14}/></button>
                      </span>
                    </div>
                  );
                })}
                {selected.subs.length === 0 && (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--clr-text-muted)' }}>
                    Esta categoría aún no tiene subcategorías.
                  </div>
                )}
              </div>
              <div className="list-add">
                <Icon name="plus" size={14}/> Añadir subcategoría a <strong style={{ marginLeft: 4 }}>{selected.name}</strong>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="es-icon"><Icon name="folder" size={20}/></div>
              <div style={{ fontSize: 15 }}>Selecciona una categoría para ver sus subcategorías.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
//  Etiquetas
// ═══════════════════════════════════════════════════════════════════
const EtiquetasScreen = () => {
  const D = window.OT_DATA;
  const [query, setQuery] = React.useState('');
  const [view, setView]   = React.useState('grid'); // grid | list

  const usage = React.useMemo(() => {
    const map = {};
    D.transactions.forEach(t => (t.tagIds || []).forEach(id => { map[id] = (map[id] || 0) + 1; }));
    return map;
  }, []);

  const rows = D.tags
    .filter(t => !query || t.name.toLowerCase().includes(query.toLowerCase()))
    .map(t => ({ ...t, uses: usage[t.id] || 0 }));

  const totalUses = D.tags.reduce((s, t) => s + (usage[t.id] || 0), 0);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Etiquetas</h1>
          <div className="subtitle">
            {D.tags.length} etiqueta(s) · {totalUses} asignación(es) a movimientos
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="segmented">
            <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>Tarjetas</button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Lista</button>
          </div>
          <button className="btn btn-outline"><Icon name="download" size={16}/> Exportar</button>
          <button className="btn btn-primary"><Icon name="plus" size={16}/> Nueva etiqueta</button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-input grow">
          <Icon name="search" size={14}/>
          <input
            placeholder="Buscar etiqueta…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="small-muted" style={{ marginLeft: 'auto' }}>
          {rows.length} de {D.tags.length}
        </span>
      </div>

      {view === 'grid' ? (
        rows.length === 0 ? (
          <div className="card empty-state">
            <div className="es-icon"><Icon name="tag" size={20}/></div>
            <div style={{ fontSize: 15 }}>No se encontraron etiquetas.</div>
          </div>
        ) : (
          <div className="tag-grid">
            {rows.map(t => (
              <div key={t.id} className="tag-card">
                <span
                  className="swatch lg round"
                  style={{ background: t.color, border: 'none' }}
                  aria-hidden="true"
                />
                <div className="tc-main">
                  <div className="tc-name">{t.name}</div>
                  <div className="tc-meta">
                    {t.uses} movimiento(s) · <span className="code-mono">{t.id}</span>
                  </div>
                </div>
                <div className="tc-actions">
                  <button className="row-action" title="Editar"><Icon name="edit" size={14}/></button>
                  <button className="row-action danger" title="Eliminar"><Icon name="trash" size={14}/></button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="tx-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Etiqueta</th>
                <th>Identificador</th>
                <th className="align-right">Usos</th>
                <th style={{ width: 88 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td>
                    <span className="swatch lg round" style={{ background: t.color, border: 'none' }}/>
                  </td>
                  <td>
                    <span className="tag-chip" style={{ background: `color-mix(in oklch, ${t.color} 45%, transparent)` }}>
                      {t.name}
                    </span>
                  </td>
                  <td><span className="code-mono">{t.id}</span></td>
                  <td className="align-right">{t.uses}</td>
                  <td>
                    <div style={{ display: 'inline-flex', gap: 2 }}>
                      <button className="row-action" title="Editar"><Icon name="edit" size={14}/></button>
                      <button className="row-action danger" title="Eliminar"><Icon name="trash" size={14}/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: 'var(--clr-text-muted)' }}>
                  No se encontraron etiquetas.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { CuentasScreen, CategoriasScreen, EtiquetasScreen });
