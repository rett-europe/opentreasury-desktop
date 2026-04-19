// ─── OpenTreasury mock data (adapted from frontend/src/app/core/mocks/mock-data.ts) ───

window.OT_DATA = (() => {
  const accounts = [
    { id: 'unicaja',     bank: 'Unicaja Banco', short: 'Unicaja',   label: 'Principal',   iban: 'ES91 2103 0001 00 0123456789', isPaypal: false, color: 'oklch(0.72 0.11 265)', balance: 18023.06, count: 703 },
    { id: 'caixa-ops',   bank: 'CaixaBank',     short: 'Caixa 5315',label: 'Operaciones', iban: 'ES12 2100 0418 45 0200051332', isPaypal: false, color: 'oklch(0.72 0.11 160)', balance:  -110.56, count:   5 },
    { id: 'caixa-fin',   bank: 'CaixaBank',     short: 'Caixa FinRett',label: 'FinRett',  iban: 'ES34 2100 0418 45 0200062845', isPaypal: false, color: 'oklch(0.72 0.11 55)',  balance:   -50.00, count:   1 },
    { id: 'caixa-0951',  bank: 'CaixaBank',     short: 'Caixa 0951',label: 'Eventos',     iban: 'ES56 2100 0418 45 0200073591', isPaypal: false, color: 'oklch(0.72 0.11 20)',  balance:   -50.00, count:   1 },
    { id: 'paypal',      bank: 'PayPal',        short: 'PayPal',    label: 'Donaciones',  iban: null,                           isPaypal: true,  color: 'oklch(0.72 0.11 305)', balance:   281.10, count:  13 },
  ];

  const categories = [
    { id: 'actividades',   name: 'Actividades',   type: 'expense', subs: ['Talleres','Terapias','Formación'] },
    { id: 'administrativo',name: 'Administrativo',type: 'expense', subs: ['Material oficina','Servicios profesionales','Seguros','Comisiones'] },
    { id: 'cuotas',        name: 'Cuotas',        type: 'income',  subs: ['Cuota Socio Anual','Cuota Socio Mensual','Cuota Familia'] },
    { id: 'donaciones',    name: 'Donaciones',    type: 'income',  subs: ['Individuales','Empresas','Anónimas'] },
    { id: 'eventos',       name: 'Eventos',       type: 'income',  subs: ['Galas benéficas','Mercadillos','Carreras solidarias','Charlas'] },
    { id: 'gastos',        name: 'Gastos',        type: 'expense', subs: ['Alquiler','Suministros','Transporte','Comunicación','Comisiones'] },
    { id: 'subvenciones',  name: 'Subvenciones',  type: 'income',  subs: ['Públicas','Privadas'] },
    { id: 'teaming',       name: 'Teaming',       type: 'income',  subs: ['Teaming'] },
  ];

  const tags = [
    { id: 'raras', name: 'Día Enfermedades Raras', color: 'oklch(0.78 0.10 330)' },
    { id: 'cal',   name: 'Calendarios 2026',       color: 'oklch(0.78 0.10 280)' },
    { id: 'gala',  name: 'Gala Benéfica 2026',     color: 'oklch(0.78 0.10 55)'  },
    { id: 'reto',  name: 'Reto Deportivo',         color: 'oklch(0.78 0.10 220)' },
    { id: 'semana',name: 'Semana Rett',            color: 'oklch(0.78 0.10 180)' },
    { id: 'merca',name: 'Mercadillo Solidario',   color: 'oklch(0.78 0.10 95)'  },
  ];

  // April 2026 transactions (reflecting the Panel screenshot + more)
  const tx = (id, date, amount, desc, account, cat, sub, tagIds = [], status = 'approved') => ({
    id, date, amount, desc, account, cat, sub, tagIds, status,
    type: amount >= 0 ? 'income' : 'expense',
  });

  const transactions = [
    tx('t001', '2026-04-10',    5.00, 'Donante #A2041',                                          'paypal',     null,            null,                    [], 'pending'),
    tx('t002', '2026-04-10',   20.00, 'Donante #A2042',                                          'paypal',     null,            null,                    [], 'pending'),
    tx('t003', '2026-04-08',   -3.03, 'Comisión devolución recibo',                             'unicaja',    'gastos',        'Comisiones',            []),
    tx('t004', '2026-04-08',  -450.00,'Ref. asociación 20260401/001',                           'unicaja',    'cuotas',        'Cuota Socio Anual',     []),
    tx('t005', '2026-04-08',   20.00, 'Socio #S0128',                                            'unicaja',    'cuotas',        'Cuota Socio Mensual',   []),
    tx('t006', '2026-04-08',   -5.00, 'Comisión de mantenimiento',                               'unicaja',    'gastos',        'Comisiones',            []),
    tx('t007', '2026-04-08',   50.00, 'Socio #S0094',                                            'unicaja',    'cuotas',        'Cuota Socio Anual',     []),
    tx('t008', '2026-04-07',   -1.00, 'Microdonación plataforma',                                'unicaja',    'administrativo','Teaming',               []),
    tx('t009', '2026-04-06', 2500.00, 'Donación corporativa — Empresa #E014',                    'unicaja',    'donaciones',    'Empresas',              ['raras']),
    tx('t010', '2026-04-05', 5000.00, 'Subvención autonómica — Programa anual',                  'unicaja',   'subvenciones',  'Públicas',              ['raras']),
    tx('t011', '2026-04-05',  -92.40, 'Recibo telefonía — Línea oficina',                        'unicaja',   'gastos',        'Comunicación',          []),
    tx('t012', '2026-04-04',  750.00, 'Recaudación mercadillo solidario',                        'caixa-0951','eventos',       'Mercadillos',           ['merca']),
    tx('t013', '2026-04-03', -340.00, 'Pago sesiones terapéuticas — Profesional #P03',           'unicaja',   'actividades',   'Terapias',              []),
    tx('t014', '2026-04-03',  -45.00, 'Envío postal — Material solidario',                       'unicaja',   'gastos',        'Transporte',            []),
    tx('t015', '2026-04-02',  200.00, 'Donación web — Campaña deportiva',                        'paypal',    'donaciones',    'Individuales',          ['reto']),
    tx('t016', '2026-04-02',   25.00, 'Donación web — Donante #W0312',                           'paypal',    'donaciones',    'Individuales',          []),
    tx('t017', '2026-04-01', -850.00, 'Recibo alquiler — Local sede',                            'unicaja',   'gastos',        'Alquiler',              []),
    tx('t018', '2026-04-01',   75.00, 'Cuota familia #F058',                                     'unicaja',   'cuotas',        'Cuota Familia',         []),
    tx('t019', '2026-03-28',  150.00, 'Donación anónima',                                        'paypal',    'donaciones',    'Anónimas',              ['raras']),
    tx('t020', '2026-03-25', 3200.00, 'Recaudación gala benéfica',                               'caixa-0951','eventos',       'Galas benéficas',       ['gala']),
    tx('t021', '2026-03-22',-1500.00, 'Seguro RC anual',                                         'caixa-fin', 'administrativo','Seguros',               []),
    tx('t022', '2026-03-19',   85.00, 'Donación web — Donante #W0298',                           'paypal',    'donaciones',    'Individuales',          []),
    tx('t023', '2026-03-17',  500.00, 'Subvención municipal — Actividades',                      'unicaja',   'subvenciones',  'Públicas',              []),
    tx('t024', '2026-03-15', -178.30, 'Recibo suministro eléctrico',                             'unicaja',   'gastos',        'Suministros',           []),
    tx('t025', '2026-03-14', -450.00, 'Servicio imprenta — Material campaña',                    'unicaja',   'administrativo','Servicios profesionales',['cal']),
    tx('t026', '2026-03-12', 1200.00, 'Venta artículos solidarios — Campaña',                    'caixa-0951','eventos',       'Mercadillos',           ['cal']),
    tx('t027', '2026-03-10',  -89.90, 'Recibo telefonía — Línea oficina',                        'unicaja',   'gastos',        'Comunicación',          []),
    tx('t028', '2026-03-08', -320.00, 'Pago sesiones terapéuticas — Profesional #P03',           'unicaja',   'actividades',   'Terapias',              []),
    tx('t029', '2026-03-06', 2500.00, 'Donación corporativa — Empresa #E014',                    'unicaja',   'donaciones',    'Empresas',              ['raras']),
    tx('t030', '2026-03-05', -125.50, 'Compra material oficina',                                 'unicaja',   'administrativo','Material oficina',      []),
  ];

  // Panel summary
  const monthSummary = { income: 48843.79, expense: 30750.19, net: 18093.60 };

  // Saldo — year-over-year by category (2025 vs 2026, partial-year for 2026)
  const yearlyByCat = [
    { cat: 'Cuotas',        type: 'income',  y2025: 18240.00, y2026:  8435.00 },
    { cat: 'Donaciones',    type: 'income',  y2025: 32180.50, y2026: 17520.00 },
    { cat: 'Eventos',       type: 'income',  y2025: 27500.00, y2026: 14120.00 },
    { cat: 'Subvenciones',  type: 'income',  y2025: 18000.00, y2026:  8500.00 },
    { cat: 'Teaming',       type: 'income',  y2025:   520.00, y2026:   268.00 },
    { cat: 'Gastos',        type: 'expense', y2025: 23145.80, y2026: 11420.30 },
    { cat: 'Actividades',   type: 'expense', y2025: 12980.00, y2026:  5860.00 },
    { cat: 'Administrativo',type: 'expense', y2025:  9870.50, y2026:  4710.20 },
    { cat: 'Eventos',       type: 'expense', y2025:  6200.00, y2026:  2760.00 },
  ];

  // Monthly history (for dashboard sparklines and Saldo's monthly bars)
  const monthly = [
    // 2025
    { y: 2025, m: 1,  income: 3120, expense: 1840 },
    { y: 2025, m: 2,  income: 4050, expense: 2010 },
    { y: 2025, m: 3,  income: 6820, expense: 3640 },
    { y: 2025, m: 4,  income: 5400, expense: 2890 },
    { y: 2025, m: 5,  income: 4980, expense: 3210 },
    { y: 2025, m: 6,  income: 7340, expense: 4500 },
    { y: 2025, m: 7,  income: 3890, expense: 2440 },
    { y: 2025, m: 8,  income: 2150, expense: 1780 },
    { y: 2025, m: 9,  income: 5620, expense: 3120 },
    { y: 2025, m: 10, income: 6890, expense: 3950 },
    { y: 2025, m: 11, income: 8240, expense: 4210 },
    { y: 2025, m: 12, income: 12450, expense: 5820 },
    // 2026 (partial — through April)
    { y: 2026, m: 1,  income: 4320, expense: 2180 },
    { y: 2026, m: 2,  income: 5890, expense: 3450 },
    { y: 2026, m: 3,  income: 7810, expense: 3798 },
    { y: 2026, m: 4,  income: 48843.79, expense: 30750.19 },
  ];

  return { accounts, categories, tags, transactions, monthSummary, yearlyByCat, monthly };
})();
