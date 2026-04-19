// ─── Tweaks panel + Root app ─────────────────────────────────────────

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "comfortable",
  "accent": "purple"
}/*EDITMODE-END*/;

const ACCENTS = {
  purple: { primary: '#6d4d8c', light: '#9c7cb5', surface: '#f3edf8', surfaceHover: '#ebe3f1' },
  teal:   { primary: '#0f766e', light: '#5eada6', surface: '#e6f4f2', surfaceHover: '#d6ece8' },
  slate:  { primary: '#3f4a5c', light: '#7a8497', surface: '#eef0f4', surfaceHover: '#e3e6ec' },
};

function applyAccent(key) {
  const a = ACCENTS[key] || ACCENTS.purple;
  const r = document.documentElement.style;
  r.setProperty('--brand-primary', a.primary);
  r.setProperty('--brand-primary-light', a.light);
  r.setProperty('--brand-surface', a.surface);
  r.setProperty('--brand-surface-hover', a.surfaceHover);
}

const TweaksPanel = ({ open, onClose, settings, setSettings }) => {
  if (!open) return null;
  const set = (k, v) => setSettings({ ...settings, [k]: v });
  return (
    <div className="tweaks-panel">
      <div className="tweaks-head">
        <span>Tweaks</span>
        <button className="icon-btn" onClick={onClose} style={{ width: 24, height: 24 }}><Icon name="close" size={14}/></button>
      </div>
      <div className="tweaks-body">
        <div className="tweak-row">
          <label>Tema</label>
          <div className="segmented">
            <button className={settings.theme === 'light' ? 'active' : ''} onClick={() => set('theme', 'light')}>Claro</button>
            <button className={settings.theme === 'dark' ? 'active' : ''}  onClick={() => set('theme', 'dark')}>Oscuro</button>
          </div>
        </div>
        <div className="tweak-row">
          <label>Densidad</label>
          <div className="segmented">
            <button className={settings.density === 'comfortable' ? 'active' : ''} onClick={() => set('density', 'comfortable')}>Cómoda</button>
            <button className={settings.density === 'compact' ? 'active' : ''}     onClick={() => set('density', 'compact')}>Compacta</button>
          </div>
        </div>
        <div className="tweak-row">
          <label>Acento</label>
          <div className="segmented">
            <button className={settings.accent === 'purple' ? 'active' : ''} onClick={() => set('accent', 'purple')}>Púrpura</button>
            <button className={settings.accent === 'teal' ? 'active' : ''}   onClick={() => set('accent', 'teal')}>Verde</button>
            <button className={settings.accent === 'slate' ? 'active' : ''}  onClick={() => set('accent', 'slate')}>Pizarra</button>
          </div>
        </div>
        <div className="tweak-row">
          <label>Barra lateral</label>
          <div
            className={`switch ${settings.sidebar === 'collapsed' ? 'on' : ''}`}
            onClick={() => set('sidebar', settings.sidebar === 'collapsed' ? 'expanded' : 'collapsed')}
          />
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem('ot_settings') || 'null'); } catch { return null; }
  })();
  const [settings, setSettingsRaw] = React.useState({
    theme: 'light', density: 'comfortable', accent: 'purple', sidebar: 'expanded',
    ...TWEAK_DEFAULTS, ...(saved || {}),
  });
  const setSettings = (s) => {
    setSettingsRaw(s);
    try { localStorage.setItem('ot_settings', JSON.stringify(s)); } catch {}
    window.parent?.postMessage({ type: '__edit_mode_set_keys', edits: s }, '*');
  };

  const [route, setRouteRaw] = React.useState(() => localStorage.getItem('ot_route') || 'panel');
  const setRoute = (r) => { setRouteRaw(r); try { localStorage.setItem('ot_route', r); } catch {} };
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Apply theme / density / accent / sidebar to body
  React.useEffect(() => {
    document.body.classList.toggle('theme-dark', settings.theme === 'dark');
    document.body.classList.toggle('density-compact', settings.density === 'compact');
    document.body.classList.toggle('sidebar-collapsed', settings.sidebar === 'collapsed');
    applyAccent(settings.accent);
  }, [settings]);

  // Listen to host edit-mode activation
  React.useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent?.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Switch to movimientos when user types into search
  React.useEffect(() => {
    if (searchQuery && route !== 'movimientos') setRoute('movimientos');
  }, [searchQuery]);

  let content;
  if (route === 'panel') content = <PanelScreen setRoute={setRoute}/>;
  else if (route === 'movimientos') content = <MovimientosScreen searchQuery={searchQuery}/>;
  else if (route === 'saldo') content = <SaldoScreen/>;
  else content = <PlaceholderScreen route={route}/>;

  return (
    <div className="app" data-screen-label={route}>
      <Topbar
        route={route}
        onToggleSidebar={() => setSettings({ ...settings, sidebar: settings.sidebar === 'collapsed' ? 'expanded' : 'collapsed' })}
        onToggleTweaks={() => setTweaksOpen(o => !o)}
        onSearch={setSearchQuery}
        searchQuery={searchQuery}
      />
      <Sidebar route={route} setRoute={setRoute}/>
      <main className="main">{content}</main>
      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} settings={settings} setSettings={setSettings}/>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
