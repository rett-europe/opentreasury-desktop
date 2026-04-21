// ─── Configuration screens: Cuentas, Categorías, Etiquetas ──────────
// Prototype-only UI for issue #1. Reuses the existing design system
// (tokens + primitives: card, btn, chip-group, filter-input, tx-table,
// badge, page-header, section-label, list-row, etc.) — no new tokens.

// ─── Shared helpers ──────────────────────────────────────────────────

/** Mask an IBAN leaving only the last 4 digits visible, grouped in 4s. */
const maskIban = (iban) => {
  if (!iban) return '';
  const compact = iban.replace(/\s+/g, '');
  if (compact.length <= 4) return compact;
  const prefix = compact.slice(0, 2); // country code remains useful
  const last4  = compact.slice(-4);
  const hiddenLen = compact.length - prefix.length - last4.length;
  const stars = '•'.repeat(hiddenLen);
  // Re-group in blocks of 4 for readability, mirroring the stored format.
  // Use a positive lookahead so no trailing whitespace is emitted inside
  // the string body.
  return `${prefix}${stars}${last4}`.replace(/(.{4})(?=.)/g, '$1 ');
};

/** Modal primitive — backdrop click closes; Esc-to-close handled by caller. */
const Modal = ({ title, sub, size = 'md', onClose, footer, children }) => {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`modal${size === 'lg' ? ' modal-lg' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {sub && <div className="mh-sub">{sub}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} title="Cerrar" aria-label="Cerrar">
            <Icon name="close" size={16}/>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

// Preset accent palette for tags/accounts (matches the oklch range used in data.js)
const PRESET_COLORS = [
  'oklch(0.72 0.11 305)', // purple
  'oklch(0.72 0.11 265)', // blue
  'oklch(0.72 0.11 220)', // teal-blue
  'oklch(0.72 0.11 180)', // teal
  'oklch(0.72 0.11 160)', // green
  'oklch(0.78 0.10 95)',  // yellow-green
  'oklch(0.72 0.11 55)',  // orange
  'oklch(0.72 0.11 20)',  // red
  'oklch(0.78 0.10 330)', // pink
  'oklch(0.78 0.10 280)', // violet
];

// ═══════════════════════════════════════════════════════════════════
//  Cuenta — create / update modal
// ═══════════════════════════════════════════════════════════════════
const CuentaModal = ({ mode, initial, onClose }) => {
  const isEdit = mode === 'edit';
  const [form, setForm] = React.useState({
    short:    initial?.short    || '',
    bank:     initial?.bank     || '',
    label:    initial?.label    || '',
    iban:     initial?.iban     || '',
    color:    initial?.color    || PRESET_COLORS[0],
    isPaypal: initial?.isPaypal || false,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [revealIban, setRevealIban] = React.useState(false);

  return (
    <Modal
      title={isEdit ? `Editar cuenta · ${initial.short}` : 'Nueva cuenta'}
      sub={isEdit ? 'Los cambios afectan solo a los metadatos — los movimientos se conservan.' : 'Las cuentas representan orígenes de dinero (bancos, plataformas).'}
      size="lg"
      onClose={onClose}
      footer={<>
        {isEdit && <button className="btn btn-ghost" style={{ color: 'var(--clr-expense)' }}><Icon name="trash" size={14}/> Eliminar cuenta</button>}
        <div className="mf-spacer"/>
        <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={onClose}>
          <Icon name="check" size={14}/> {isEdit ? 'Guardar cambios' : 'Crear cuenta'}
        </button>
      </>}
    >
      <div className="field-row">
        <div className="field">
          <label htmlFor="ac-short">Nombre corto <span className="req">*</span></label>
          <div className="input">
            <Icon name="bank" size={14}/>
            <input id="ac-short" value={form.short} onChange={(e) => set('short', e.target.value)} placeholder="p. ej. Unicaja"/>
          </div>
          <div className="hint">Aparece en listas, filtros y pills de movimientos.</div>
        </div>
        <div className="field">
          <label htmlFor="ac-bank">Banco o plataforma <span className="req">*</span></label>
          <div className="input">
            <input id="ac-bank" value={form.bank} onChange={(e) => set('bank', e.target.value)} placeholder="p. ej. Unicaja Banco"/>
          </div>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ac-label">Etiqueta de uso</label>
        <div className="input">
          <Icon name="tag" size={14}/>
          <input
            id="ac-label"
            list="ac-label-suggestions"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="p. ej. Principal, Operaciones, Eventos…"
          />
          <datalist id="ac-label-suggestions">
            <option value="Principal"/>
            <option value="Operaciones"/>
            <option value="Eventos"/>
            <option value="Donaciones"/>
            <option value="FinRett"/>
            <option value="Reserva"/>
          </datalist>
        </div>
        <div className="callout">
          <span className="ca-icon"><Icon name="info" size={14}/></span>
          <span>
            La <strong>etiqueta</strong> describe el <strong>propósito interno</strong> de la cuenta (Principal, Operaciones, Eventos, Reserva…). Se usa solo como metadato en esta pantalla y en el Panel — <strong>no</strong> se aplica a los movimientos ni sustituye a las <em>etiquetas de movimientos</em> (categorías / tags), que son taxonomías independientes.
          </span>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="ac-iban">IBAN</label>
          <div className="input mono">
            <input
              id="ac-iban"
              type={revealIban ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={form.iban}
              onChange={(e) => set('iban', e.target.value)}
              placeholder="ES00 0000 0000 00 0000000000"
              disabled={form.isPaypal}
            />
            <button
              type="button"
              className="row-action"
              title={revealIban ? 'Ocultar IBAN' : 'Mostrar IBAN'}
              onClick={() => setRevealIban(v => !v)}
            >
              <Icon name={revealIban ? 'eyeOff' : 'eye'} size={14}/>
            </button>
          </div>
          <div className="hint">
            {form.isPaypal
              ? 'Las cuentas PayPal no usan IBAN.'
              : 'Se almacena cifrado en el dataset; en la UI solo se muestran los últimos 4 dígitos salvo revelado explícito.'}
          </div>
        </div>
        <div className="field">
          <label htmlFor="ac-color">Color</label>
          <div className="swatch-picker" id="ac-color">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                className={`swatch-btn ${form.color === c ? 'active' : ''}`}
                style={{ background: c }}
                aria-label={c}
                onClick={() => set('color', c)}
              />
            ))}
          </div>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 4, fontSize: 'var(--font-sm)', color: 'var(--clr-text-secondary)', textTransform: 'none', letterSpacing: 0, fontWeight: 'var(--fw-regular)' }}>
            <input type="checkbox" checked={form.isPaypal} onChange={(e) => set('isPaypal', e.target.checked)}/>
            Es una plataforma externa (PayPal, Stripe…)
          </label>
        </div>
      </div>

      <div className="field">
        <label>Vista previa</label>
        <div className="preview-box">
          <div className="entity-icon" style={{ background: form.color }}>
            <Icon name="bank" size={16} stroke={2}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'var(--fw-medium)' }}>{form.short || 'Nombre corto'}</div>
            <div className="small-muted">{form.bank || 'Banco o plataforma'}</div>
          </div>
          {form.label && (
            <span className="account-pill" style={{ background: `color-mix(in oklch, ${form.color} 18%, transparent)` }}>
              <span className="dot" style={{ background: form.color }}/>
              {form.label}
            </span>
          )}
          <span className="code-mono">
            {form.isPaypal ? '—' : (form.iban ? maskIban(form.iban) : 'ES•• •••• •••• •• ••••••••••')}
          </span>
        </div>
      </div>
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════════════
//  Cuentas
// ═══════════════════════════════════════════════════════════════════
const CuentasScreen = () => {
  const D = window.OT_DATA;
  const [query, setQuery] = React.useState('');
  const [revealed, setRevealed] = React.useState(() => new Set()); // per-row IBAN reveal
  const [modal, setModal] = React.useState(null); // { mode, account? }

  const toggleReveal = (id) => {
    const s = new Set(revealed);
    s.has(id) ? s.delete(id) : s.add(id);
    setRevealed(s);
  };

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
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            <Icon name="plus" size={16}/> Nueva cuenta
          </button>
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
              const isRevealed = revealed.has(a.id);
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
                    {a.iban ? (
                      <span className="iban-reveal">
                        <span className="code-mono">{isRevealed ? a.iban : maskIban(a.iban)}</span>
                        <button
                          className="row-action"
                          title={isRevealed ? 'Ocultar IBAN' : 'Mostrar IBAN'}
                          aria-label={isRevealed ? 'Ocultar IBAN' : 'Mostrar IBAN'}
                          onClick={() => toggleReveal(a.id)}
                        >
                          <Icon name={isRevealed ? 'eyeOff' : 'eye'} size={13}/>
                        </button>
                      </span>
                    ) : <span className="small-muted">—</span>}
                  </td>
                  <td className="align-right">{a.count}</td>
                  <td className={`align-right ${negative ? 'amount-expense' : 'amount-income'}`}>
                    {fmt.eur(a.balance)}
                  </td>
                  <td>
                    <div style={{ display: 'inline-flex', gap: 2 }}>
                      <button
                        className="row-action"
                        title="Editar"
                        onClick={() => setModal({ mode: 'edit', account: a })}
                      >
                        <Icon name="edit" size={14}/>
                      </button>
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

      {modal && (
        <CuentaModal
          mode={modal.mode}
          initial={modal.account}
          onClose={() => setModal(null)}
        />
      )}
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
//  Etiqueta — create / update modal
// ═══════════════════════════════════════════════════════════════════
const EtiquetaModal = ({ mode, initial, usageCount = 0, onClose }) => {
  const isEdit = mode === 'edit';
  const [form, setForm] = React.useState({
    name:  initial?.name  || '',
    id:    initial?.id    || '',
    color: initial?.color || PRESET_COLORS[0],
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-derive id from name on create (slug-lite).
  React.useEffect(() => {
    if (isEdit) return;
    const slug = form.name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .slice(0, 24)
      .replace(/-+$/, '');
    setForm(f => ({ ...f, id: slug }));
  }, [form.name, isEdit]);

  return (
    <Modal
      title={isEdit ? `Editar etiqueta · ${initial.name}` : 'Nueva etiqueta'}
      sub={isEdit
        ? `${usageCount} movimiento(s) usan esta etiqueta · los cambios se propagan automáticamente.`
        : 'Las etiquetas se aplican a movimientos para agrupar campañas, eventos o iniciativas transversales.'}
      onClose={onClose}
      footer={<>
        {isEdit && (
          <button
            className="btn btn-ghost"
            style={{ color: 'var(--clr-expense)' }}
            title={usageCount > 0
              ? `${usageCount} movimiento(s) quedarán sin esta etiqueta`
              : 'Eliminar etiqueta'}
          >
            <Icon name="trash" size={14}/> Eliminar
          </button>
        )}
        <div className="mf-spacer"/>
        <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={onClose}>
          <Icon name="check" size={14}/> {isEdit ? 'Guardar' : 'Crear etiqueta'}
        </button>
      </>}
    >
      <div className="field">
        <label htmlFor="tg-name">Nombre <span className="req">*</span></label>
        <div className="input">
          <Icon name="tag" size={14}/>
          <input
            id="tg-name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="p. ej. Gala Benéfica 2026"
            autoFocus
          />
        </div>
        <div className="hint">Mostrado en chips dentro de la tabla de movimientos.</div>
      </div>

      <div className="field">
        <label htmlFor="tg-id">Identificador</label>
        <div className="input mono">
          <input
            id="tg-id"
            value={form.id}
            onChange={(e) => set('id', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="gala-benefica-2026"
            disabled={isEdit}
          />
        </div>
        <div className="hint">
          {isEdit
            ? 'El identificador no se puede cambiar una vez creada la etiqueta (se usa como referencia estable en los movimientos).'
            : 'Se genera automáticamente a partir del nombre. Solo letras, números y guiones.'}
        </div>
      </div>

      <div className="field">
        <label>Color</label>
        <div className="swatch-picker">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={`swatch-btn ${form.color === c ? 'active' : ''}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              onClick={() => set('color', c)}
            />
          ))}
        </div>
        <div className="hint">Usado en los chips y en la vista de tarjetas.</div>
      </div>

      <div className="field">
        <label>Vista previa</label>
        <div className="preview-box">
          <span className="pb-label">Chip</span>
          <span className="tag-chip" style={{ background: `color-mix(in oklch, ${form.color} 45%, transparent)` }}>
            {form.name || 'Nombre de la etiqueta'}
          </span>
          <span className="pb-label" style={{ marginLeft: 'auto' }}>Punto</span>
          <span className="swatch lg round" style={{ background: form.color, border: 'none' }} aria-hidden="true"/>
        </div>
      </div>

      {isEdit && usageCount > 0 && (
        <div className="callout">
          <span className="ca-icon"><Icon name="info" size={14}/></span>
          <span>
            Esta etiqueta se aplica a <strong>{usageCount} movimiento(s)</strong>. Cambiar el nombre o color los actualiza de inmediato. Al eliminarla, los movimientos conservan el resto de sus etiquetas.
          </span>
        </div>
      )}
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════════════
//  Etiquetas
// ═══════════════════════════════════════════════════════════════════
const EtiquetasScreen = () => {
  const D = window.OT_DATA;
  const [query, setQuery] = React.useState('');
  const [view, setView]   = React.useState('grid'); // grid | list
  const [modal, setModal] = React.useState(null);   // { mode, tag? }

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
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            <Icon name="plus" size={16}/> Nueva etiqueta
          </button>
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
                  <button
                    className="row-action"
                    title="Editar"
                    onClick={() => setModal({ mode: 'edit', tag: t })}
                  >
                    <Icon name="edit" size={14}/>
                  </button>
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
                      <button
                        className="row-action"
                        title="Editar"
                        onClick={() => setModal({ mode: 'edit', tag: t })}
                      >
                        <Icon name="edit" size={14}/>
                      </button>
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

      {modal && (
        <EtiquetaModal
          mode={modal.mode}
          initial={modal.tag}
          usageCount={modal.tag ? (usage[modal.tag.id] || 0) : 0}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

Object.assign(window, { CuentasScreen, CategoriasScreen, EtiquetasScreen, CuentaModal, EtiquetaModal });
