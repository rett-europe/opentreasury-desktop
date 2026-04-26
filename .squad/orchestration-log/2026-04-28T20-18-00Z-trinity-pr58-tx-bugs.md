# Trinity — PR #58: Transaction Detail Bugs Fixed (Merged)

**Date:** 2026-04-28  
**PR:** #58  
**Status:** ✅ MERGED to main  
**Agent:** Trinity (claude-sonnet-4.5)  
**Requester:** Pedro (dev-empty feedback)

## Manifest

Fixed 3 transaction-detail bugs reported by Pedro on dev-empty branch. All fixes ship in PR #58.

### Bug 1: DatosScreen "See transactions" CTA Navigation

**Issue:** "Ver movimientos" CTA on DatosScreen (category detail) did not navigate to movements; stayed on DatosScreen.

**Fix:** 
- Added new `onNavigateToMovements?: () => void` prop to DatosScreen
- Plumbed prop from parent (App.tsx router) to DatosScreen component
- CTA now calls `onNavigateToMovements()` which routes via app state

**Files:** DatosScreen.tsx, App.tsx

### Bug 2: Description Tooltip Missing Reference + Details

**Issue:** Transaction detail tooltip showed only description, not the reference and details fields.

**Fix:**
- Extended tooltip rendering to include `reference` and `details` alongside description
- New i18n keys: `movements.tooltip.reference`, `movements.tooltip.details`
- Tooltip now displays all three fields in a readable format

**Files:** MovementsScreen (row detail tooltip), i18n keys added

### Bug 3: Reference + Details Not Threaded Through Type System

**Issue:** Movement type schema and mapMovementRecord did not carry reference/details fields; main-process movements:list handler was dropping them from the event log.

**Fix:**
- Extended Movement type to include `reference?: string` and `details?: string`
- Updated mapMovementRecord to thread these fields from event
- Updated main-process movements:list handler to include reference/details in response
- All i18n keys pre-wired (movements.tooltip.reference, movements.tooltip.details)

**Files:** 
- Movement type definition
- mapMovementRecord helper
- main-process movements:list handler
- i18n (ES+EN parity)

## Testing

- All tests passing (no breaking changes)
- New fields are optional; existing data without reference/details degrades gracefully
- E2E verified on dev-empty: all three bugs closed

## Cross-System Impact

- **IPC contract:** movements:list response now includes reference/details (optional fields, backward-compatible)
- **Event log:** Events already carry reference/details; handler now passes through
- **i18n:** No new namespaces; keys added to `movements.tooltip.*`
