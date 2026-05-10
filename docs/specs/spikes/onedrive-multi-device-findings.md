# OneDrive Multi-Device File Append Smoke Test — Findings

> **Spike ID:** SPEC-026 Item #0  
> **Status:** Pending execution  
> **Owner:** Morpheus  
> **Date created:** 2025-06-13  
> **Related:** [Issue #302](../../issues/302), SPEC-026 v2 §4.3–4.4

---

## Purpose

SPEC-026 v2 redesigns the event log to use a **per-device-file architecture**: each enrolled device writes to its own `events-{deviceId}.ndjson` in a shared cloud-synced folder (OneDrive, SharePoint, or Dropbox). This eliminates write conflicts entirely — if two devices never touch the same file, no conflict copies can occur.

**This spike validates the core assumption:** OneDrive does NOT generate conflict copies when two processes append to **different files** in the same synced folder.

If this assumption holds, the architecture is safe. If it fails, we need conflict-merge logic for event files (+2 days).

---

## What We're Testing

1. **Scenario:** Two independent processes writing simultaneously to **different** files in the same OneDrive-synced folder.
2. **File pattern:** `events-deviceA.ndjson` and `events-deviceB.ndjson` (mimicking SPEC-026 v2's per-device files).
3. **Write pattern:** Each process appends 50 lines at 1-second intervals (~50 seconds of overlapping writes).
4. **Sync settlement:** Wait 120 seconds after writes complete for OneDrive sync to finish.
5. **Detection:** Scan the folder for conflict copies (patterns: `*-conflict*`, `*(1)*`, `*(deviceName)*`, date suffixes).

---

## How to Run

### Prerequisites

- A folder inside an active OneDrive-synced directory (e.g., `C:\Users\pedro\OneDrive\opentreasury-spike-test`).
- OneDrive client running and connected.
- No other processes writing to the test folder during the spike.

### Execution

```powershell
# 1. Create a test folder inside your OneDrive directory
mkdir "$env:USERPROFILE\OneDrive\opentreasury-spike-test"

# 2. Run the spike script (from repo root)
node scripts/spikes/onedrive-multi-device.mjs "$env:USERPROFILE\OneDrive\opentreasury-spike-test"

# 3. Wait ~3 minutes (50s writes + 120s settle)

# 4. Review the output
```

The script will:
- Spawn two child processes (`deviceA` and `deviceB`)
- Each writes 50 lines to its own file (100 lines total)
- Wait 2 minutes for OneDrive sync to settle
- Scan for conflict copies and validate both files
- Print **PASS** or **FAIL** with details

---

## Expected Outcomes

### ✅ PASS (OneDrive behaves as we expect)

**Indicators:**
- Both `events-deviceA.ndjson` and `events-deviceB.ndjson` exist with 50 lines each.
- No conflict copies detected (no files matching `*-conflict*`, `*(1)*`, etc.).
- All lines are valid JSON.
- Combined line count = 100.

**Implication:**  
SPEC-026 v2 per-device-file architecture is **safe to proceed**. No conflict-merge logic needed for event files. Each device can append to its own file without risk of OneDrive creating conflict copies.

**Next step:**  
Close this spike, proceed to Item #1 (crypto primitives).

---

### ❌ FAIL (OneDrive creates conflict copies)

**Indicators:**
- Conflict copies appear (e.g., `events-deviceA (1).ndjson`, `events-deviceB-conflict-2025-06-13.ndjson`).
- OR: Target files are missing or corrupted.
- OR: Line counts don't match expected values.

**Implication:**  
SPEC-026 v2 per-device-file architecture requires **conflict-merge logic**. We cannot rely on "different files = no conflicts" alone. This adds complexity and ~2 days to the implementation timeline.

**Escape hatch:**  
Switch to a **single-file-with-locking** approach (SPEC-026 v1 style) or implement conflict detection + merge for per-device files:
- On read: glob `events-*.ndjson` + `events-*-conflict*.ndjson`
- Merge all conflict copies by ULID order
- Delete conflict copies after merge
- Log a warning to the user ("Sync conflict detected and resolved")

**Next step:**  
Consult with Pedro and Keaton on go/no-go decision. If we proceed with per-device files, add conflict-merge to the work plan.

---

## Assumptions

1. **OneDrive client behavior:** The spike assumes OneDrive uses standard file-locking semantics. If OneDrive locks files at the folder level (unlikely), conflicts might still occur. This spike will surface that.

2. **Append-only writes:** The script uses `fs.appendFile`, which mirrors how the real event log will work. No in-place edits, no file overwrites.

3. **Timing:** 1-second append interval + 120-second settle time should be sufficient for OneDrive to sync both files and detect any conflicts. If OneDrive takes longer (e.g., large backlog, slow connection), we might get false negatives. Pedro should run this on a clean OneDrive state.

4. **Platform:** This spike runs on Windows. OneDrive behavior on macOS may differ slightly (though the underlying sync protocol is the same). If cross-platform consistency is critical, we should re-run on macOS.

---

## Known Limitations

- **Not a stress test:** 50 lines/device is a small workload. Real-world usage might involve hundreds of appends per session. However, the conflict-copy mechanism (if it exists) should trigger even on small concurrent writes.

- **Single sync provider:** This spike tests OneDrive only. Dropbox and SharePoint may behave differently. If we need to support multiple providers, we should spike each one.

- **No interference testing:** The spike assumes no other processes are writing to the folder. If Pedro's OneDrive folder has other activity (e.g., background sync from another app), results might be noisy.

---

## Results

**Execution date:** _[Pedro to fill in]_  
**OneDrive version:** _[Pedro to fill in]_  
**Windows version:** _[Pedro to fill in]_  

**Outcome:** _[PASS / FAIL]_

**Details:**

_[Pedro: Paste the script output here, including the PASS/FAIL summary and any conflict files detected]_

**Decision:**

_[Pedro/Keaton: Document the go/no-go decision based on results]_

---

## References

- [SPEC-026 v2](../026-encryption-at-rest.md) — Per-device-file architecture (§4.3–4.4)
- [Issue #302](../../issues/302) — OneDrive sync smoke spike (Item #0)
- [.squad/decisions.md](../../../.squad/decisions.md) — Team decisions (see SPEC-026 multi-user entries)

---

## Cleanup

After the spike is complete and results are documented:

1. Delete the test folder (`$env:USERPROFILE\OneDrive\opentreasury-spike-test`)
2. Archive this spike script (we may reference it later, but it's throwaway code)
3. Close issue #302
4. Update the work plan (Item #0 → DONE)

**Do NOT integrate this script into the app.** It's a one-off validation tool.
