## Data-layer perf (main-process only — no renderer)

Host: node=v20.20.2 platform=linux arch=x64
Trials per size: 5 (cell = median)
Source: `scripts/perf-measure.ts` (run: `npm run perf:measure`)

Column meaning:
- **fs.readFile** — raw disk read of `events.ndjson`
- **load()** — `JsonFileEventLog.load()` (read + NDJSON parse + id extract)
- **replayEvents** — reducer fold into the `ReadModel` singleton
- **movements:list** — `createMovementsListHandler({})` with no filters (filter + sort + slice + map, 12 fields × N rows)
- **zod.parse** — `movementsListResponseSchema.parse(records)` (IPC boundary validation)
- **Total** — sum of load + replay + handler + zod (mirrors what happens between an IPC call arriving and the response being sent)

| N tx | File (KiB) | fs.readFile | load() | replayEvents | movements:list | zod.parse | **Total** |
| ---: | ---------: | ----------: | -----: | -----------: | -------------: | --------: | --------: |
| 1,000 | 561 | 1.3 ms | 3.8 ms | **5.0 ms** | 0.70 ms | 5.7 ms | **15 ms** |
| 2,500 | 1,390 | 2.8 ms | 8.0 ms | **16 ms** | 1.9 ms | 5.8 ms | **35 ms** |
| 5,000 | 2,772 | 5.3 ms | 15 ms | **48 ms** | 3.7 ms | 10 ms | **77 ms** |
| 10,000 | 5,537 | 10 ms | 30 ms | **181 ms** | 8.6 ms | 25 ms | **246 ms** |
