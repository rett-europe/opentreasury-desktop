# Novedades para la prueba de campo

> **OpenTreasury — Trial 1 (Wave B)** · Junio 2026
>
> **Cómo leer esta página:** la sección **"Ya disponible (v0.1.0-trial.3.14–3.16)"** resume lo que se ha publicado más recientemente en la línea de prueba. Las secciones **"Lo nuevo"** / **"What's new"** recogen las novedades de la entrega anterior (Wave B), que también están disponibles. La sección **"Lo que sabemos que falta"** describe lo que **aún no** está y está planificado para una entrega futura. La fuente autorizada de lo publicado es [`CHANGELOG.md`](../../CHANGELOG.md).

---

## Ya disponible (v0.1.0-trial.3.14–3.16)

**Exportar a CSV y Excel (v0.1.0-trial.3.14)** — Nueva pantalla **Exportar** en la barra de navegación. Exporta una porción **filtrada** de tus movimientos (por cuenta, categoría/subcategoría, rango de fechas y etiqueta/búsqueda) a **CSV** o **Excel**. Se exige un rango de fechas más al menos un filtro (no se permite la exportación completa), el CSV usa `;` como separador, las fechas/números y el nombre del archivo siguen tu configuración regional, y una confirmación escrita (**EXPORTAR**) autoriza cada exportación. Consulta la [guía de usuario → Exportar](../guides/user-guide.es.md#exportar-csv-y-excel-filtrados).

**Protección de integridad silenciosa (v0.1.0-trial.3.15)** — Base criptográfica de auditoría a prueba de manipulación (SPEC-028, Niveles 0–2). Es **infraestructura, sin pantalla nueva**: si los archivos de eventos se alteran fuera de la aplicación, el siguiente desbloqueo lo detecta y te dirige a la recuperación en lugar de cargar datos alterados, con sellado de tiempo externo RFC-3161. Es **evidente a la manipulación + con sello de tiempo externo, no a prueba de manipulación**. (La pantalla de Auditoría/visor de evidencias aún **no** está disponible.)

**Refuerzo y pulido (v0.1.0-trial.3.16)** — Se corrigió un riesgo de bloqueo erróneo al desbloquear, se restauró el diseño tranquilo del rango de fechas en Movimientos y Análisis (sin doble barra de desplazamiento), y se agrupó Idioma, Formato de fecha y Formato de número en una única tarjeta **"Idioma y formato"** en Preferencias.

---

## Lo nuevo

_Las siguientes novedades se entregaron en la versión de prueba anterior (Wave B) y siguen disponibles._

**Dividir movimientos (Splits)** — Ya puedes dividir un movimiento entre varias categorías o subcategorías. Selecciona un movimiento y pulsa "Dividir", asigna cada parte a su categoría, y listo. Perfecto para gastos mixtos (comida de reunión + material de oficina).

**Aprobación en lotes (Bulk Approve)** — Selecciona varios movimientos pendientes de aprobación. Verás un botón "Aprobar" en la barra inferior. Pulsa una vez y todos se aprueban juntos. Ahorra tiempo cuando importas muchos extractos de golpe.

**Distribución por subcategoría en Análisis** — Abre Análisis → Detalle de etiqueta o Detalle de categoría. Verás un nuevo panel que desgrana la distribución por subcategoría, y puedes filtrar entre Gastos e Ingresos. Útil para entender dónde va el dinero dentro de cada categoría.

**Búsqueda libre en la barra superior** — Pulsa Ctrl+K (Windows/Linux) o Cmd+K (Mac) desde cualquier pantalla. Se abre un cuadro de búsqueda en la barra superior. Escribe una palabra (ej: "cafetería", "comida", "unicaja") y entra en Movimientos con solo los que coinciden. Busca en descripción, notas, categorías, etiquetas y montos. Accent-insensitive (café = cafe).

**Corrección visual de cifras truncadas** — El indicador "%" en Saldo ya no se corta en pantallas pequeñas. Ahora ves los números completos.

**Alineación a la derecha de cifras** — Los importes y totales están alineados a la derecha para que sea fácil comparar de un vistazo. Más legible.

---

## Cómo probar

1. **Dividir un movimiento:** Abre Movimientos. Busca un gasto en Unicaja que tenga un importe redondo (ej: €500). Haz clic. Verás un botón "Dividir" abajo a la derecha. Pulsa y crea dos partes: una en "Materiales" y otra en "Viajes". Guarda. Verás el movimiento padre con una badge "1 de 2 partes coincide".

2. **Aprobar varios de golpe:** En Movimientos, abre el rango "Últimos 30 días". Deberías ver varios movimientos en estado "Pendiente" (gris). Selecciona 3 o 4 (casilla a la izquierda). En la barra de abajo verás "Aprobar". Pulsa y ve cómo se vuelven verdes todos a la vez.

3. **Búsqueda libre:** Desde cualquier pantalla (Panel, Análisis, Saldo), pulsa Ctrl+K. Se abre un recuadro en la barra superior. Escribe "comida" y pulsa Enter. Te lleva a Movimientos con solo los que tienen "comida" en algún sitio (descripción, notas, etc.). Verás el contador "3 de 487" abajo a la izquierda.

4. **Ver distribución por subcategoría:** Abre Análisis. Haz clic en una categoría grande (ej: "Gastos generales"). Verás un panel nuevo en la derecha que desgrana por subcategoría. Arriba hay un selector: pulsa "Ingresos" para ver ingresos, "Gastos" para gastos.

5. **Buscar con acentos:** En la búsqueda superior, escribe "cafe" (sin acento). Debería devolverte movimientos que tienen "Café" (con acento). Prueba también "accion" para encontrar "acción".

6. **Limpiar búsqueda:** Si estás en resultados de búsqueda y quieres volver al listado completo, en la barra superior pulsa la ✕ al lado del cuadro de búsqueda, o pulsa Escape.

---

## Lo que sabemos que falta

- **Búsqueda "fuzzy"** (tolerante a fallos de tipeo) — Aún no está. Si escribes "cofee" en vez de "coffee", no encontrará nada. Revisaremos si es necesario según vuestro feedback.
- **Splits E2E al 100%** — Podéis crear splits, pero la cobertura de casos extremos aún es limitada. Si encontráis algo roto, reportadlo.
- **Crear automáticamente taxonomía en import** — Cuando importáis un CSV, si aparece una categoría nueva, tenéis que crearla a mano. Aún no lo hace automático.
- **Contar transacciones por subcategoría en tooltip** — Si hacéis hover sobre una subcategoría en Análisis, no veréis cuántas transacciones hay. Viene en una versión próxima.

---

## Cómo darnos feedback

[TODO Pedro: define feedback channel — email? GitHub issue? Notion?]

Contadnos si algo no funciona, si os parece confuso, o si hay algo que echéis en falta. Vuestro feedback es lo que nos ayuda a mejorar.

---

## What's new (English)

_The items below shipped in the previous trial build (Wave B) and remain available. For the most recent additions (Export, audit/integrity foundation, v3.16 polish), see "Ya disponible (v0.1.0-trial.3.14–3.16)" above and [`CHANGELOG.md`](../../CHANGELOG.md)._

**Filtered CSV & Excel export (v0.1.0-trial.3.14)** — A new **Export** entry in the navigation bar exports a **filtered** slice of your movements (by account, category/subcategory, date range, and label/search) to **CSV** or **Excel**. A date range plus at least one more filter is required (no full export), CSV uses `;` as the separator, dates/numbers and the filename follow your locale, and a typed confirmation (**EXPORT**) authorizes each run. See the [user guide → Export](../guides/user-guide.md#export-filtered-csv-and-excel).

**Silent integrity protection (v0.1.0-trial.3.15)** — A tamper-evident audit foundation (SPEC-028, Tiers 0–2). It's **infrastructure, with no new screen**: if event files are altered outside the app, the next unlock detects it and routes to recovery instead of loading altered data, with external RFC-3161 timestamping. It is **tamper-evident + externally timestamped, not tamper-proof**. (The Audit / evidence viewer screen is **not** shipped yet.)

**Hardening & polish (v0.1.0-trial.3.16)** — Fixed a false unlock-lockout risk, restored the calm date-range layout in Movements and Insights (no double scrollbar), and merged Language, Date format, and Number format into a single **"Language & format"** card in Preferences.

**Split transactions (Splits)** — You can now split a transaction across multiple categories or subcategories. Select a transaction and press "Split", assign each part to its category, and you're done. Perfect for mixed expenses (team lunch + office supplies).

**Bulk approval** — Select multiple pending transactions. You'll see an "Approve" button in the bottom bar. Press once and all are approved together. Saves time when you import many statements at once.

**Subcategory breakdown in Insights** — Open Insights → Tag detail or Category detail. You'll see a new panel that shows the breakdown by subcategory, and you can filter between Expenses and Income. Useful for understanding where the money goes within each category.

**Free-text search in the top bar** — Press Ctrl+K (Windows/Linux) or Cmd+K (Mac) from any screen. A search box opens in the top bar. Type a word (e.g., "lunch", "coffee", "unicaja") and jump to Transactions with only the matches. Searches description, notes, categories, tags, and amounts. Accent-insensitive (café = cafe).

**Fixed truncated percentage display** — The "%" indicator in Balance no longer gets cut off on small screens. You now see the full numbers.

**Right-aligned amounts** — Amounts and totals are now right-aligned so you can compare them at a glance. More readable.

---

## How to try it

1. **Split a transaction:** Open Transactions. Find an expense on Unicaja with a round amount (e.g., €500). Click it. You'll see a "Split" button at the bottom right. Press and create two parts: one in "Materials" and one in "Travel". Save. You'll see the parent transaction with a badge "1 of 2 splits match".

2. **Approve several at once:** In Transactions, open the range "Last 30 days". You should see several transactions in "Pending" status (gray). Select 3 or 4 (checkbox on the left). In the bottom bar you'll see "Approve". Press and watch them all turn green at once.

3. **Free-text search:** From any screen (Dashboard, Insights, Balance), press Ctrl+K. A search box opens in the top bar. Type "lunch" and press Enter. You're taken to Transactions with only the matches. You'll see the counter "3 of 487" at the bottom left.

4. **See subcategory breakdown:** Open Insights. Click on a large category (e.g., "General Expenses"). You'll see a new panel on the right that breaks down by subcategory. At the top there's a toggle: press "Income" to see income, "Expense" for expenses.

5. **Search with accents:** In the top search, type "cafe" (no accent). It should return transactions that have "Café" (with accent). Try also "accion" to find "acción".

6. **Clear search:** If you're in search results and want to go back to the full list, in the top bar press the ✕ next to the search box, or press Escape.

---

## Known gaps

- **Fuzzy search** (typo-tolerant) — Not yet. If you type "cofee" instead of "coffee", it won't find anything. We'll review if needed based on your feedback.
- **Splits E2E coverage** — You can create splits, but edge-case coverage is still limited. If you find something broken, please report it.
- **Auto-create taxonomy on import** — When you import a CSV, if a new category appears, you have to create it manually. It doesn't auto-create yet.
- **Transaction count per subcategory in tooltip** — If you hover over a subcategory in Insights, you won't see how many transactions there are. Coming in a future release.

---

## How to give us feedback

[TODO Pedro: define feedback channel — email? GitHub issue? Notion?]

Tell us if anything doesn't work, if something is confusing, or if you miss something. Your feedback is what helps us improve.
