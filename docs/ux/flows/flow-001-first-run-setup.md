# Flow 001 — First-Run / Folder Setup

> **Status:** Skeleton v0.1 · **Owner:** Niobe (UX) · **Date:** 2026-04-19
> **Type:** Flow skeleton — establishes shape; full spec follows in Wave 1 (UX-001).
> **Traceability:** vision §8 (time-to-first-tx ≤10min); [R20](../../security/security-requirements-v0.1.md#r20--first-run-security-posture-wizard); [CS §4](../../security/crypto-spec.md#4-first-setup-flow); [AR9 SmartScreen](../../security/security-requirements-v0.1.md#6-accepted-risks-v1); [prototype-analysis G1](../prototype-analysis-v1.md#g1--no-first-run--folder-selection-flow), [UX-R3](../prototype-analysis-v1.md#ux-r3--smartscreen-install-warning-ar9-kills-first-run-before-the-app-opens).

---

## 1. Actors

- **Maria** — the NGO's treasurer installing OpenTreasury Desktop for the first time on her laptop.
- **The app** — Electron process running on Maria's machine.
- **OneDrive / SharePoint** — already installed on Maria's machine (M365 is the assumed substrate per vision §2); folder sync is already working for her other files.
- **The OS keychain** — DPAPI on Windows (v1 scope per AR10).
- **The NGO's shared folder** — may not yet exist; if it exists, may or may not contain a prior `.treasury/escrow.json`.

**Out-of-scope actors for this flow:** other members (covered by flow-002-device-enrollment).

---

## 2. Preconditions

- Maria has downloaded and installed the app, clicking past the SmartScreen warning (AR9) per install guide.
- Maria is signed into OneDrive / SharePoint on the OS.
- Maria has at least read-access to her intended shared folder (or can create a new folder in a OneDrive-synced location).
- No prior OpenTreasury state exists on the device (clean install). If prior state exists → different flow (resume / re-link, spec'd later).

---

## 3. Happy Path — Branch A: Become the first admin of a brand-new treasury

This is the dominant path for the first NGO treasurer.

| # | User sees | User does | System does |
|---|---|---|---|
| 1 | Welcome screen: one-sentence product description; "Get started" primary button; link to guide. No data entry yet. | Clicks "Get started" | Advances to folder-picker step |
| 2 | "Pick the folder where your treasury will live" + "Create new folder" + "Use existing folder" options; a safety hint: "This should be a folder inside your OneDrive or SharePoint sync, not a random local folder." | Picks `OneDrive\NGOData\Treasury` (new, empty) | Validates path is within a known OneDrive-synced location; creates the folder if missing |
| 3 | Detection spinner for <1s; app reads folder contents | waits | Checks for `.treasury/escrow.json`; finds none → folder is "unclaimed" |
| 4 | "This folder has no treasury yet. You'll become its first admin." — explains what admin means in plain language ("You approve new devices that want to read this treasury."). "Continue" primary; "Pick a different folder" secondary. | Clicks "Continue" | Branches to admin bootstrap |
| 5 | R20 security-posture checklist — non-skippable: MFA on MS account (link), disk encryption recommended, never share via public link, folder-access ≠ treasury-access. Each is a checkbox acknowledgment, not a verification. | Checks each box; clicks "I understand" | Persists acknowledgments (locally + audit log later); advances |
| 6 | "Name this device" input (suggested from OS hostname, e.g., "Maria - laptop"). Explanation: "Other admins will see this name when approving or revoking your device." | Accepts suggestion or edits; clicks "Continue" | Persists device name locally (will be written into escrow) |
| 7 | "Setting up your treasury…" progress (expected <2s) | waits | Generates device X25519 keypair, Ed25519 signing keypair, local-cache key; stores all three in OS keychain scoped to this dataset; generates DEK v1; wraps DEK to own X25519 pubkey; constructs `escrow.json` (admin = self, dek_version=1, devices=[self]); signs; writes to folder; writes genesis audit entry (encrypted w/ DEK v1). Per CS §4. |
| 8 | Success screen: "✅ Your treasury is ready. You can record your first transaction." Shows the folder location. Primary CTA "Record first transaction" → New Transaction form (UX-006); secondary "Go to dashboard" → Panel (empty state UX-010). | Clicks either | Routes accordingly |

**Success criteria for this path:** Steps 1–8 complete in ≤5 minutes of wall-clock time (well under the ≤10min metric). No jargon surfaced. User knows where the folder lives, what admin means, and what their next action is.

---

## 4. Happy Path — Branch B: Join a treasury somebody else already set up

Maria is joining an NGO whose treasurer (José) already created the treasury. Maria's OneDrive has the folder shared in.

| # | User sees | User does | System does |
|---|---|---|---|
| 1 | (same welcome as Branch A) | Clicks "Get started" | |
| 2 | (same folder picker) | Picks the shared folder | |
| 3 | Detection spinner | waits | Finds `.treasury/escrow.json`; verifies signature against a device entry. |
| 4 | "This treasury belongs to {NGO display name}. Your device hasn't been enrolled yet — an admin needs to approve it." | Clicks "Continue" | Branches to enrollment request → **hand-off to [flow-002](./flow-002-device-enrollment.md) step 1** |

*Continuation beyond step 4 is covered in flow-002.*

---

## 5. Happy Path — Branch C: Re-link on a device that already has keys (resume)

Maria installed, set up, worked, quit the app. She re-launches. **This is not "first run" anymore but it shares entry points, so noting here.**

The app should detect keychain entries matching the last-opened folder and bypass steps 1–8 entirely, opening directly to Panel. **Full behavior spec'd in UX-004 (app shell) and UX-011 (Settings — Change folder).**

---

## 6. Key Edge Cases / Error Paths (enumerated, not fully spec'd)

Each requires a branch that will be detailed in the full UX-001 spec. Error copy reviewed against the principle "errors are actionable, never cryptic."

- **E1 — Selected folder is NOT inside a OneDrive/SharePoint sync root.** Warn; allow override with explicit "I understand this folder won't sync" acknowledgment; recommend picking a synced path. Pedro open question: should override be allowed at all in v1?
- **E2 — Selected folder is read-only for the current user.** Block; explain; offer "pick different folder".
- **E3 — Folder already contains a `.treasury/escrow.json` but its signature is invalid.** Branch to "this treasury looks damaged — we can restore from a snapshot" (cross-reference UX-009 error catalog).
- **E4 — OneDrive client not running / not signed in.** Warn at step 2; let the user proceed but flag that sync will not work until OneDrive is running.
- **E5 — OS keychain unavailable** (DPAPI disabled, locked-down environment). Block with clear message: "OpenTreasury needs access to your OS keychain to protect your treasury's keys. This usually works out of the box on Windows."
- **E6 — Disk full during setup / write of escrow.json fails.** Roll back (delete any partial files); ask user to retry.
- **E7 — User picks a folder with thousands of unrelated files in the root.** Not a blocker, but warn and offer to create a `Treasury` subfolder.
- **E8 — App is not signed (AR9 / AR10).** Not a first-run concern — handled at install time (UX-019).
- **E9 — Unsupported OneDrive variant** (consumer vs. business surface quirks — vision Q2 still open). Detect best-effort; proceed; flag if any known-broken pattern (e.g., SharePoint site root vs library root).

---

## 7. Accessibility Notes

- **Keyboard navigation:** Tab order walks Welcome → folder picker → detection result → acknowledgment checkboxes → device name → setup → success. Each step's primary button is the default (Enter submits). `Esc` never destroys progress (no accidental setup aborts).
- **Focus management:** First focus on each step lands on the step's heading (with `tabindex="-1"`) and is announced by screen readers; the primary input focuses next.
- **Screen reader:** Progress is announced at steps 3, 7 ("Setting up — do not close"). Success step announces the completed state and the next CTAs clearly.
- **Contrast and visibility:** Checkbox acknowledgments in step 5 must pass contrast AA; checked state must be perceivable without color (shape change).
- **Folder picker dialog:** Uses the OS file chooser — inherits OS accessibility.
- **Reduced motion:** No progress animation exceeds 2s; if it does, replaces with a static message.

---

## 8. Open Questions

1. **Should the welcome screen detect the user's OS language and pre-select it**, or always start in Spanish until they change it in Settings? (Recommendation: OS language if supported, else Spanish. Blocked on vision Q6.)
2. **Should the R20 acknowledgment checklist be a single screen with checkboxes, or a sequence of one-screen-per-item?** Single screen is faster; sequence is more likely to be read. (Recommendation: single screen with checkboxes; require scroll-to-end before enabling "Continue".) — Switch copy review.
3. **NGO display name — do we ask Maria for it in step 6, or derive from folder name?** Folder name is fragile (users rename); explicit field is clearer but adds a step. (Recommendation: derive from folder name with an "Edit" affordance in Settings later.)
4. **Does "I understand" in step 5 write an audit entry?** Useful for governance ("Maria acknowledged the security posture on…"); adds an audit entry before the user has done anything. (Recommendation: yes — first genuine audit entry is `dataset.created`; the posture ack is included as a sub-field on that entry, not a separate entry.) — Switch.
5. **Should we offer to invite a second admin immediately after setup** ("Set up a backup admin now? Otherwise, if your laptop dies, no one can add devices.")? This is one answer to CS §3.3 orphaned-admin risk. (Recommendation: soft-prompt with "Do later" option.) — Link.
6. **What does the "Pick a different folder" secondary do at step 4** if the user is in Branch A? Go back to step 2, keeping the R20 acknowledgments already given, or reset? (Recommendation: keep acknowledgments; folder choice is reversible up until step 7.)

---

*End of flow-001 skeleton. Full UX-001 spec to be written in Wave 1 per ux-spec-plan.md.*
