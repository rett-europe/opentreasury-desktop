// ─── Shared icons (minimal line icons) ──────────────────────────────
const Icon = ({ name, size = 18, stroke = 1.75 }) => {
  const paths = {
    menu: <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    diamond: <path d="M12 3l8 9-8 9-8-9 8-9z"/>,
    panel: <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>,
    list: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
    scale: <><path d="M3 12h18"/><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/></>,
    tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1"/></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>,
    bank: <><line x1="3" y1="21" x2="21" y2="21"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="5 10 5 21"/><polyline points="19 10 19 21"/><polyline points="9 10 9 21"/><polyline points="15 10 15 21"/><polyline points="12 2 2 10 22 10"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    user: <><circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    search: <><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    trend: <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>,
    trendDown: <><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></>,
    calculator: <><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="10" y2="16"/><line x1="14" y1="16" x2="16" y2="16"/></>,
    arrowUp: <polyline points="18 15 12 9 6 15"/>,
    arrowDown: <polyline points="6 9 12 15 18 9"/>,
    close: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.85 19.85 0 0 1-3.17 4.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>,
    info: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────
const fmt = {
  eur: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n),
  eur0: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n),
  date: (s) => {
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  },
};

// ─── AppShell (topbar + sidebar) ─────────────────────────────────────
const NAV = [
  { section: 'Principal', items: [
    { id: 'panel',       label: 'Panel',        icon: 'panel' },
    { id: 'movimientos', label: 'Movimientos',  icon: 'list' },
    { id: 'saldo',       label: 'Saldo',        icon: 'scale' },
  ]},
  { section: 'Configuración', items: [
    { id: 'categorias',  label: 'Categorías',   icon: 'folder' },
    { id: 'etiquetas',   label: 'Etiquetas',    icon: 'tag' },
    { id: 'cuentas',     label: 'Cuentas',      icon: 'bank' },
  ]},
  { section: 'Datos', items: [
    { id: 'importacion', label: 'Importación',  icon: 'upload' },
    { id: 'exportar',    label: 'Exportar',     icon: 'download' },
  ]},
];

const Topbar = ({ onToggleSidebar, onToggleTweaks, route, onSearch, searchQuery }) => (
  <header className="topbar">
    <button className="icon-btn" onClick={onToggleSidebar} title="Toggle sidebar"><Icon name="menu"/></button>
    <div className="brand">
      <svg className="brand-mark" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L22 12 L12 22 L2 12 Z"/></svg>
      <span>OpenTreasury</span>
    </div>
    <div className="divider-v" style={{ marginLeft: 8, marginRight: 4 }}/>
    <div className="small-muted" style={{ color: 'var(--clr-text-muted)' }}>
      Demo NGO
    </div>
    <div className="spacer"/>
    <label className="topbar-search">
      <Icon name="search" size={16}/>
      <input
        placeholder="Buscar movimientos, categorías, cuentas…"
        value={searchQuery}
        onChange={(e) => onSearch(e.target.value)}
      />
      <kbd>⌘K</kbd>
    </label>
    <button className="icon-btn" title="Configuración"><Icon name="settings" size={18}/></button>
    <button className="icon-btn" onClick={onToggleTweaks} title="Tweaks"><Icon name="filter" size={18}/></button>
  </header>
);

const Sidebar = ({ route, setRoute }) => (
  <aside className="sidebar">
    {NAV.map((sec, i) => (
      <React.Fragment key={sec.section}>
        <div className="nav-section-label">{sec.section}</div>
        {sec.items.map((it) => (
          <div
            key={it.id}
            className={`nav-item ${route === it.id ? 'active' : ''}`}
            onClick={() => setRoute(it.id)}
          >
            <Icon name={it.icon} size={18}/>
            <span className="nav-item-label">{it.label}</span>
          </div>
        ))}
      </React.Fragment>
    ))}
    <div className="spacer"/>
    <div className="user-strip">
      <div className="user-avatar">PR</div>
      <div className="user-meta">
        <div className="user-name">Pedro Rocha</div>
        <div className="user-role">Admin</div>
      </div>
      <button className="user-logout" title="Cerrar sesión"><Icon name="logout" size={14}/></button>
    </div>
  </aside>
);

Object.assign(window, { Icon, fmt, Topbar, Sidebar, NAV });
