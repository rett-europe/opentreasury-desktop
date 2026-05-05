# trial.3.1 Re-Test Instructions

Pedro,

The trial.3.1 installer you tested **did NOT contain the folder-switch fix** from PR #270.

## What Happened

- PR #270 merged the `process.exit(0)` fix to the source code on May 5th at 09:51
- The git tag was created and package.json was bumped to 0.1.0-trial.3.1
- **But the actual Electron package was never rebuilt**
- The installer you tested contained stale JavaScript from May 4th (before the fix)
- So the process never actually died → old data stayed in memory
- That's why app-config.json updated but the dashboard still showed "Rett Spain" data

## What I Did

✅ `npm run build && npm run package` — rebuilt the REAL trial.3.1 with the fix
✅ Verified the packaged `app.asar` contains `process.exit(0)` at the relaunch point
✅ New installer: `out\OpenTreasury Setup 0.1.0-trial.3.1.exe` (119.2 MB, built 05/05 10:53:34)

## Next Steps

1. **Install the NEW `out\OpenTreasury Setup 0.1.0-trial.3.1.exe`** from the build output
2. Launch the app with your existing "Rett Spain" data
3. Go to Preferences → change data folder to a NEW empty folder
4. App should restart
5. **Verify:**
   - Preferences shows the new folder path ✓
   - Dashboard shows NO data (empty charts, zero balances) ✓
   - Title bar still says "Rett Spain" (expected — profile.json is separate)
6. Switch back to the old folder → data should reappear
7. Switch to the new folder again → data should disappear again

If this works, we can re-upload to GitHub releases (replacing the broken trial.3.1 asset).

If it still doesn't work, there's a deeper bug and I'll investigate further.

## Files Changed

- None! The fix was already in the source. Just needed a proper rebuild.

## Decisions

- `.squad/decisions/inbox/morpheus-trial-3-1-real-fix.md` — full root-cause analysis
- `.squad/agents/morpheus/history.md` — learning added

— Morpheus
