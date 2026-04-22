# Session Log: Preload CJS Fix

**Timestamp:** 2026-04-19T17:23:27Z  
**Agent:** Coordinator (Lightweight Mode)  
**Requested by:** Pedro (perocha)  

## Problem

Preload script was double-emitting in dev mode: `vite-plugin-electron` runs two parallel rollup builds that concatenate on disk, creating invalid syntax (124KB file with CJS bundles joined at syntax boundary). `emptyOutDir: true` only clears outdir on first build, not subsequent rebuilds.

## Solution

Bypassed `vite-plugin-electron` for preload entirely. Implemented inline Vite plugin ("opentreasury-preload-esbuild") that calls esbuild directly:
- Format: CJS (Electron sandbox requirement)
- External: electron
- `handleHotUpdate` triggers rebuild + full reload on preload source changes

## Blockers Resolved

Three consecutive dev-loop blockers:
1. **Preload ESM blocker** → Electron CJS requirement
2. **Preload double-emit** → vite-plugin-electron rollup concatenation
3. **esbuild bypass** → Inline plugin with direct esbuild call

## Changes

- **vite.config.ts:** Added inline "opentreasury-preload-esbuild" plugin; removed vite-plugin-electron preload entry
- **app/src/main/index.ts:** Dev-only CSP relaxation for debugging
- **app/src/renderer/index.html:** CSP meta tag alignment

**Commit:** `3c376fd` — "fix(dev): preload as CJS via esbuild + dev-only CSP relaxation" (3 files)

## Outcome

✅ Panel renders with mock fixture data. Electron window shows content. Build loop working.  
✅ Pedro confirmed: "now it works"  
⚠️ Next: Panel UX corrections (separate task)
