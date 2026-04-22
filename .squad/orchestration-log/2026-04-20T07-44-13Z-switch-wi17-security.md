# Orchestration Log: Switch WI-17 Security Review

**Timestamp:** 2026-04-20T07:44:13Z  
**Agent:** Switch (Security Officer)  
**Task:** WI-17.5 — security audit of file handling + IPC contracts

## Review Findings

**Status:** ✅ **APPROVED-WITH-CONDITIONS**

## 6 Mandatory Conditions

1. **Swap `xlsx` → `exceljs`** — xlsx has 2 HIGH CVEs (CVE-2023-30533, CVE-2024-22363)
2. **Windows-aware path hardening** — reject UNC paths, device paths, reserved names, symlinks
3. **Session file-path allowlist** — in-memory registry, opaque ULID fileIds, TTL 30min
4. **Opaque file-ID tokens** — renderer passes fileId (not raw paths) to dry-run/commit
5. **Row-count cap** — reject >100k rows (zip-bomb mitigation)
6. **Symlink rejection** — fs.lstat + isSymbolicLink() check
7. **Parser safety flags** — exceljs: no formulas, header sanitize; papaparse: dynamicTyping:false

## Remediation Plan

**By:** Morpheus (follow-up implementation pass after initial impl)  
**Scope:** 7 changes applied as security-hardening patch (not interrupting main work)  
**Timeline:** ~2 hours (library swap + path guards + file registry)

## Report

Full review: `.squad/decisions/inbox/switch-wi17-security-review.md`

## Next Steps

1. Morpheus: Security hardening pass (library swap, path guards, fileId registry)
2. Trinity: Renderer fixup (align to new fileId contract)
3. Full build + lint + test validation
4. Merge with security attestation
