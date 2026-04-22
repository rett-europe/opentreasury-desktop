# Orchestration Log: Morpheus WI-17 Security Hardening

**Timestamp:** 2026-04-20T07:44:13Z  
**Agent:** Morpheus (Backend Developer)  
**Task:** Apply Switch's 6+1 security conditions to WI-17 main-side

## Deliverables

### Condition 1: Library Swap
- ✅ Removed `xlsx` (CVE-2023-30533, CVE-2024-22363)
- ✅ Added `exceljs` (v4.4.0) — actively maintained, no HIGH CVEs
- Rewrite: `handleXlsxStaging`, `loadXlsxRows` with async/await pattern

### Condition 2: Windows Path Hardening
- ✅ `pathGuard.ts` (2.8 KB) — UNC, device, reserved names, symlinks, traversal
- ✅ `pathGuard.test.ts` (13 tests, all green)
- Integrated into `createStageFileHandler`

### Condition 3: Session File-Path Allowlist
- ✅ `sessionFileRegistry.ts` (2.2 KB) — in-memory Map, ULID fileIds, 30-min TTL
- ✅ `sessionFileRegistry.test.ts` (9 tests, all green)

### Condition 4: Opaque FileId Tokens
- ✅ Updated IPC contract: `fileId` in responses, `fileId` in requests (not `filePath`)
- ✅ Renderer never sends raw paths after stage-file

### Condition 5: Row-Count Cap (Zip-Bomb)
- ✅ MAX_ROW_COUNT = 100k, enforced in CSV + XLSX parsing
- ✅ Error code: `ROW_COUNT_EXCEEDED`

### Condition 6: Symlink Rejection
- ✅ Integrated into pathGuard: `fs.lstat()` + `isSymbolicLink()` check

### Condition 7: Parser Safety Flags
- ✅ exceljs: formulas off, header sanitize (control-char strip, 500-char cap)
- ✅ papaparse: `dynamicTyping: false`, `skipEmptyLines: true`, header cap

## Status

✅ **COMPLETE** — All 6 conditions + error-codes applied. Tests: 197 passed (175 existing + 22 new).

## Validation

- Main-side typecheck: ✅ 0 errors
- npm audit: ✅ 0 vulnerabilities (was 1 HIGH before)
- Tests: ✅ 197 green (pathGuard:13, sessionFileRegistry:9, + existing)

## Report

Full implementation report: `.squad/decisions/inbox/morpheus-wi17-sec-harden.md`

## Note

**Breaking change:** IPC contract now uses opaque `fileId` instead of `filePath`. Trinity has parallel fix-up spawn.

## Next Steps

1. Trinity: Renderer refactor (align to new fileId contract)
2. Coordinator: Full build + lint + test validation
3. Commit: WI-17 security hardening + Trinity renderer fixup together
