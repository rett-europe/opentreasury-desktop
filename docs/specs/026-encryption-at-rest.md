# SPEC-026 — Encryption at Rest (v2)

> **Status:** Proposed · **Version:** v2 · **Supersedes:** v1 (single-device)
> **Owner:** Niobe · **Last updated:** 2026-05-12
> **Paired ADR:** — (crypto-spec v2.0; multi-user-from-day-one)
> **Paired UX:** inline (this spec)
> **Paired Design:** TBD — Mouse to polish first-run, join, and recovery screens
> **Architecture input:** `.squad/decisions/inbox/keaton-spec-026-multiuser-redesign.md`

---

## 1. Summary

OpenTreasury encrypts all event data at rest with **per-event AEAD**
(XChaCha20-Poly1305) under a shared **Master Key (MK)**. The workspace is
designed for **2–5 trusted users** (e.g., an NGO board) sharing a single folder
via OneDrive, SharePoint, or Dropbox. Each device writes to its own event file
(`events-{deviceId}.ndjson`), eliminating cloud-sync write conflicts entirely.
The read model merge-sorts all device files on launch.

The MK is wrapped two ways per device: silently via Electron `safeStorage` for
daily use, and recoverably via a **12-word BIP39 recovery phrase** that doubles
as the team enrollment secret. The first user generates the recovery code; each
subsequent user joins by entering it. There is no "skip" — recovery code
confirmation is mandatory before reaching the dashboard.

Guiding principle: **Security is non-negotiable.** Invisible by default for daily
use; recoverable without jargon when the user's world goes sideways.

This spec ships **before the membership feature**, so member personal data is
encrypted from day one.

## 2. Goals & Non-Goals

### Goals

- Encrypt every event at rest under a Master Key the team controls.
- **Multi-user workspace:** 2–5 users sharing a cloud-synced folder, each
  writing to their own device file. No write conflicts.
- **Invisible daily UX:** silent unlock via `safeStorage` on each user's normal
  machine — no password prompt on every launch.
- **Survivable user disasters:** lost laptop, OS reinstall, accidental userData
  wipe, OneDrive restore to a new machine. With the recovery code in hand, any
  enrolled user gets back in.
- **Self-service enrollment:** new users join by entering the 12-word recovery
  code. No admin panel, no invitation system.
- Ship before the membership feature so member PII is encrypted from launch.
- **Audit trail for free:** every event already carries `actorDeviceId` and
  `actorUserId` in the envelope. No schema changes needed.

### Non-Goals (v1)

- **Per-user revocation, key rotation.** The recovery code is the team secret.
  Anyone who has received it retains access. Copies of the workspace remain
  readable with the original recovery code — same trust model as an
  Excel-password-protected file shared among board members. Full revocation
  (rotate MK, re-encrypt all events) is deferred.
- Real-time collaboration / presence.
- Permission tiers (read-only vs. editor).
- Hardware token support (YubiKey, Trezor).
- Escrow / admin-key recovery services.
- Passphrase upgrade path (passphrase as alternative to mnemonic).
- Encrypting derived artefacts (read-model snapshot, cached aggregations) — see
  §13 open question.
- Read-model snapshot cache (always rebuild from glob on launch — see §11).

## 3. Threat Model

### In scope

| Threat | Mitigation |
|--------|------------|
| Lost or stolen laptop without disk encryption | Both wraps required to read events; `safeStorage` is per-OS-user, recovery wrap is Argon2id-hard. |
| Cloud backup leak (OneDrive/Dropbox copies workspace) | Encrypted ciphertext is opaque without the MK. |
| Shared / multi-user PC, other local user reads files | `safeStorage` (DPAPI/Keychain/libsecret) is per-OS-user; recovery wrap requires the mnemonic. |
| Support-bundle screenshots leaking workspace paths | Paths reveal nothing — file contents are ciphertext. |
| Another enrolled device is compromised | Attacker already had access to the shared folder (same MK). Device-level revocation is out of scope for v1 — removing the device's `devices[]` entry prevents silent unlock but does not revoke access to data the attacker already downloaded. Same risk as sharing an encrypted Excel file with a board member who later leaves. |

### Out of scope

- Malware running as the live user account (can call our APIs while app is open).
- Memory inspection of the running process.
- Side-channel attacks (timing, power analysis).
- Compromised electron-builder supply chain.
- Coercion / compelled disclosure of the recovery code.

## 4. Architecture

### 4.1 Crypto Primitives

- **AEAD:** XChaCha20-Poly1305 (`sodium-native`, libsodium binding).
- **KDF (recovery wrap):** Argon2id, default params **m = 64 MiB, t = 3, p = 1**
  (target ~500 ms on a 2020-era laptop — Keaton to confirm; see §13).
- **CSPRNG:** `crypto.randomBytes` (Node) / libsodium `randombytes_buf`.
- **Mnemonic:** BIP39 English wordlist, **12 words**, 128-bit entropy
  (`bip39` npm package or equivalent).

### 4.2 Key Hierarchy

1. **Master Key (MK)** — 256 bits, generated once at workspace creation via
   CSPRNG. Never leaves memory unwrapped except during AEAD operations. Shared
   across all enrolled devices (same key, different wraps).
2. **Per-device wrap (safeStorage)** — MK encrypted via Electron `safeStorage`
   (`safeStorage.encryptString`). Each device has its own entry in the
   `devices[]` array of `events.key`. Used for daily silent unlock.
3. **Recovery wrap (shared)** — Wrapping key derived from the 12-word phrase via
   Argon2id (over a per-workspace 16-byte salt). MK encrypted under that key
   with XChaCha20-Poly1305. Single copy, shared across all devices. Used for
   enrollment, recovery, and export-decrypted.

All wraps decrypt to the **same** MK. The MK does not change unless explicitly
rotated (out of scope v1).

**Enrollment protocol (new device joins):**

1. User B installs OpenTreasury, points at the workspace folder (folder picker).
2. App detects `events.key` exists but has no entry for this `deviceId` → routes
   to **Join flow**.
3. User B enters the 12-word recovery code (Pedro shared it out-of-band).
4. App derives the recovery key (Argon2id, same params from `events.key`),
   unwraps MK.
5. App wraps MK under User B's local `safeStorage`.
6. App appends User B's device entry to the `devices[]` array in `events.key`,
   writes atomically.
7. User B sees the dashboard. From now on, their device unlocks silently.

#### `events.key` v2 schema

```json
{
  "version": 2,
  "devices": [
    {
      "deviceId": "01JWEXAMPLE001AAAAAAAAAAAA",
      "label": "Pedro-Surface",
      "wrap_safestorage": "<base64>",
      "enrolled_at": "2026-05-10T14:32:00Z"
    },
    {
      "deviceId": "01JWEXAMPLE002BBBBBBBBBBBB",
      "label": "Maria-ThinkPad",
      "wrap_safestorage": "<base64>",
      "enrolled_at": "2026-05-11T09:15:00Z"
    }
  ],
  "wrap_recovery": "<base64 nonce || ciphertext || tag>",
  "salt": "<base64, 16 bytes>",
  "argon2_params": { "m_kib": 65536, "t": 3, "p": 1 },
  "created_at": "2026-05-10T14:32:00Z"
}
```

**What changed from v1:** `wrap_safestorage` (singular) → `devices[]` (array of
per-device wraps). `wrap_recovery`, `salt`, and crypto params are unchanged —
they are workspace-level, immutable after creation.

**Write conflicts on `events.key`:**

- Rare: only happens during enrollment or recovery (not daily use).
- If two devices enroll simultaneously and OneDrive produces a conflict copy: on
  next read, detect conflict files matching `events.key*`, merge `devices[]`
  arrays by `deviceId` (union), keep the latest `wrap_safestorage` per device.
  Delete conflict file after merge.
- The `wrap_recovery`, `salt`, and `argon2_params` are immutable after creation —
  no merge ambiguity.

### 4.3 File Layout

#### Workspace folder (cloud-synced, shared)

| File | Contents |
|------|----------|
| `events-{deviceId}.ndjson` | Encrypted event log for one device (one base64 ciphertext per line). One file per enrolled device. |
| `events.key` | v2 key file: per-device wraps + shared recovery wrap + Argon2 params (JSON, atomic write). |
| `workspace.json` | Workspace metadata: `workspaceId`, `datasetId`, `schemaVersion`, `createdAt`. |

#### Per-machine (userData, NOT synced)

| File | Contents |
|------|----------|
| `device.json` | `{ "deviceId": "<ULID>", "userId": "<ULID>", "workspacePath": "<path>" }`. Generated at first launch. Per-machine, never shared. |

**Device identity lifecycle:**

- `deviceId`: generated at first launch (`ULID()`), persisted in `device.json`
  under `app.getPath('userData')`. Stable and unique per OS user per machine.
- `userId`: for v1, each device generates a local `userId`. The field already
  supports `actorIdentitySource: 'local' | 'aad'` for future Entra ID
  integration.

### 4.4 Read / Write Path

| Aspect | Detail |
|--------|--------|
| **Write path** | Each device appends only to `events-{its-own-deviceId}.ndjson`. Never touches another device's file. Encrypt the JSON event with MK, base64-encode, `fs.appendFile`. |
| **Read path** | On load: glob `events-*.ndjson`, read all files, merge-sort all events by ULID (`event.id`), deduplicate by `event.id`. Feed to reducers. |
| **Ordering** | ULIDs are time-sortable (millisecond precision). For an NGO app where events are created minutes/hours apart, cross-device ordering by ULID is deterministic and correct. Pathological case: two users create events within the same millisecond — ULID's random suffix breaks the tie arbitrarily but deterministically (same sort on every device). |
| **Encryption** | Same per-event AEAD as v1. Each line in each file is independently encrypted. MK is shared across all devices. |
| **AAD binding** | **`eventId + ":" + deviceId`** (UTF-8 bytes) — binds ciphertext to both the event's ULID and the device file it was written to. A line from `events-{A}.ndjson` cannot be transplanted into `events-{B}.ndjson` and decrypted; the mismatched deviceId causes AEAD verification failure. Format: `"{eventId}:{deviceId}"`. |
| **Decryption failure** | Hard error on any single line (corruption or tamper) — surface to the user, do not silently skip. |
| **Nonces** | Per-event, 24 random bytes from CSPRNG. Same-process collision check at write time. |

**Scenario walkthroughs:**

- **Two users write at the same time:** Pedro writes to `events-{pedroDevice}.ndjson`.
  Maria writes to `events-{mariaDevice}.ndjson`. Different files. OneDrive syncs
  both independently. No conflict. On next app launch, both files are read and
  merged in ULID order.

- **One user offline for a day:** Maria's laptop was offline. She created 5
  events. OneDrive was not syncing. She comes back online, OneDrive uploads her
  file. Pedro's app picks up Maria's events on next load via the glob.

- **Append-only design:** "Editing" a transaction emits a new event
  (`tx.updated`). "Deleting" emits `tx.deleted`. These are new appends to the
  writer's file. No cross-file mutation ever occurs.

## 5. First-Run UX Flow

### 5.1 Detection Logic

On boot, after the user points at a workspace folder, check its contents:

| # | State | Route |
|---|-------|-------|
| 1 | No `events.key`, no `events-*.ndjson` | → **Fresh setup flow** (§5.2) |
| 2 | `events.key` exists, this `deviceId` NOT in `devices[]` | → **Join flow** (§5.3) |
| 3 | `events.key` exists, this `deviceId` in `devices[]`, safeStorage works | → **Dashboard** (silent unlock) |
| 4 | `events.key` exists, this `deviceId` in `devices[]`, safeStorage fails | → **Recovery flow** (§6) |
| 5 | Legacy: `events.ndjson` (single file) exists, no `events.key` | → **Migration flow** (§8) |

### 5.2 Fresh Setup Flow (Creator — Pedro)

The first user creates the workspace. Four screens. The user **cannot** reach
the dashboard until Screen 3.

#### Screen 1 — Choose Workspace Folder

| EN | ES |
|---|---|
| **Where should OpenTreasury store your data?** | **¿Dónde debe OpenTreasury guardar tus datos?** |
| Choose a folder for your treasury workspace. If you plan to share with other board members, pick a folder inside OneDrive or a shared drive. | Elige una carpeta para tu espacio de trabajo. Si planeas compartir con otros miembros de la junta, elige una carpeta dentro de OneDrive o una unidad compartida. |
| [ Choose Folder… ] | [ Elegir carpeta… ] |

- Opens the native OS folder picker.
- The selected path is stored in `device.json` (per-machine, not synced).
- No auto-default to the OneDrive root — the user makes a conscious choice.

i18n keys: `onboarding.encryption.folder.{title,body,btn_choose}`.

#### Screen 2 — Why + Recovery Code

| EN | ES |
|---|---|
| **Your data, encrypted and shared securely.** | **Tus datos, cifrados y compartidos de forma segura.** |
| OpenTreasury keeps your treasury data private. We'll set up a recovery code now — this is the **only** way to get your data back if you lose access to this computer, and the way other board members will join this workspace. | OpenTreasury mantiene los datos de tu tesorería privados. Vamos a crear ahora un código de recuperación: es la **única** forma de recuperar tus datos si pierdes el acceso a este equipo, y la manera en que otros miembros de la junta se unirán a este espacio de trabajo. |

- Display 12 words in a clean **3 columns × 4 rows** grid, numbered 1–12.
- Three primary actions:
  - **[ Print ]** — opens the OS print dialog with a printable layout.
  - **[ Save as PDF ]** — writes a PDF to a user-chosen path.
  - **[ I've written it down ]** — advances to Screen 2b.
- Caption beneath the grid:

| EN | ES |
|---|---|
| Store this somewhere safe, away from this computer. Share it with anyone who needs access to this workspace — it's the key to your shared treasury. | Guárdalo en un lugar seguro, lejos de este equipo. Compártelo con cualquiera que necesite acceso a este espacio de trabajo: es la llave de tu tesorería compartida. |

i18n keys: `onboarding.encryption.show.{title,body,grid_caption,btn_print,btn_pdf,btn_written}`.

#### Screen 2b — Confirm

- Pick **3 random word positions** out of 12 (e.g., #2, #7, #11). Re-roll on
  retry so failure → retry doesn't memo-train the same indices.
- Three input fields, each with the position label. Inputs accept BIP39 words
  with autocomplete-from-wordlist (no free typing of non-wordlist words).
- Real-time validation: inputs turn green when correct, red on blur if wrong.
- **[ Continue ]** is disabled until **all three** are correct.
- **No skip. No "I'll do this later."** No way to bypass.
- Footer note (small, subdued):

| EN | ES |
|---|---|
| If you close OpenTreasury now, we'll start over next time. | Si cierras OpenTreasury ahora, empezaremos de nuevo la próxima vez. |

i18n keys: `onboarding.encryption.confirm.{title,prompt,placeholder,error,footer,continue}`.

#### Screen 3 — Done

| EN | ES |
|---|---|
| **Your workspace is encrypted.** | **Tu espacio de trabajo está cifrado.** |
| Anyone you share the recovery code with can join from their own computer. | Cualquiera con quien compartas el código de recuperación puede unirse desde su propio equipo. |
| [ Continue to Dashboard ] | [ Ir al panel ] |

i18n keys: `onboarding.encryption.done.{title,body,continue}`.

#### State semantics

- The MK is **generated lazily** at the start of the flow but is **not
  persisted** to `events.key` until Screen 2b confirmation passes.
- If the user closes the app at any point before Screen 3, the in-memory MK is
  discarded. Next launch starts the flow again with a freshly generated MK +
  freshly generated 12 words. The previous, unconfirmed words are not reused.

### 5.3 Join Flow (Joiner — Maria)

Maria installs OpenTreasury, chooses the same workspace folder (Pedro told her
the path out-of-band), and the app detects `events.key` with no entry for her
device.

#### Screen J1 — Folder + Recovery Code

| EN | ES |
|---|---|
| **Join an existing workspace.** | **Unirse a un espacio de trabajo existente.** |
| Point to the shared folder and enter the 12-word recovery code you received from the workspace owner. | Apunta a la carpeta compartida e introduce el código de recuperación de 12 palabras que recibiste del propietario del espacio de trabajo. |

- **[ Choose Folder… ]** — opens the native OS folder picker. If the user
  already selected a folder (e.g., via the dataset chooser) and `events.key` was
  detected, this step is pre-filled and the folder picker is optional.
- 12 numbered input fields in a 3×4 grid, BIP39 autocomplete.
- **[ Join ]** button enabled when all 12 are valid wordlist entries.
- Optional nice-to-have (v1 or v1.1): asks for a device label ("What should we
  call this computer?") — defaults to OS hostname. Stored in `devices[].label`.

i18n keys: `onboarding.join.{title,body,btn_folder,btn_join,label_prompt}`.

#### Screen J2 — Unlocking

| EN | ES |
|---|---|
| **You're in.** | **Ya estás dentro.** |
| OpenTreasury will unlock automatically from now on. | OpenTreasury se desbloqueará automáticamente a partir de ahora. |
| [ Continue to Dashboard ] | [ Ir al panel ] |

On valid code:
1. Derive recovery key via Argon2id (same params from `events.key`).
2. AEAD-decrypt `wrap_recovery` → MK.
3. Wrap MK under this device's local `safeStorage`.
4. Append device entry to `devices[]` in `events.key` (atomic write).
5. Show Screen J2.

i18n keys: `onboarding.join.success.{title,body,continue}`.

#### On invalid code

| EN | ES |
|---|---|
| That recovery code doesn't match. Please check and try again. | Ese código de recuperación no coincide. Comprueba e inténtalo de nuevo. |

- After **5 failed attempts**, append a help line — **no lockout**:

| EN | ES |
|---|---|
| Need help? [Contact support](…) | ¿Necesitas ayuda? [Contactar con soporte](…) |

A lockout would defeat the enrollment purpose: the user is proving trust by
typing 12 BIP39 words; bricking them after a typo helps no one.

i18n keys: `onboarding.join.{error,help_after_5}`.

## 6. Recovery Flow

**Trigger:** App boot. The renderer asks main to unlock the MK. Main reads
`events.key`, finds this `deviceId` in `devices[]`, attempts
`safeStorage.decryptString(wrap_safestorage)`. On failure (decrypt throws, or
`safeStorage.isEncryptionAvailable()` returns false), main emits a
`needs-recovery` signal. Renderer routes to the recovery screen.

### Recovery screen

| EN | ES |
|---|---|
| **Welcome back.** | **Bienvenido de nuevo.** |
| To unlock your treasury data, please enter your 12-word recovery code. | Para desbloquear los datos de tu tesorería, introduce tu código de recuperación de 12 palabras. |

- 12 numbered input fields in a 3×4 grid, BIP39 autocomplete.
- **[ Unlock ]** button enabled when all 12 are valid wordlist entries.

### On valid code

1. Derive key via Argon2id over `events.key.salt` + entered phrase (with the
   stored `argon2_params`).
2. AEAD-decrypt `wrap_recovery` → MK.
3. Re-wrap MK under current `safeStorage` → new `wrap_safestorage`.
4. **Add or update** this device's entry in the `devices[]` array of `events.key`
   (upsert by `deviceId`). If the entry exists, overwrite `wrap_safestorage`;
   if not (edge case: entry was removed), append a new entry.
5. Atomically rewrite `events.key`.
6. Continue boot to the dashboard.

### On invalid code

| EN | ES |
|---|---|
| That recovery code doesn't match. Please check and try again. | Ese código de recuperación no coincide. Comprueba e inténtalo de nuevo. |

- After **5 failed attempts**, append a help line — **no lockout**:

| EN | ES |
|---|---|
| Need help? [Contact support](…) | ¿Necesitas ayuda? [Contactar con soporte](…) |

i18n keys: `recovery.{title,body,unlock,error,help_after_5}`.

## 7. Export Decrypted (Settings escape hatch)

Located at **Preferences → Advanced → Export decrypted data**.

### Warning copy

| EN | ES |
|---|---|
| **Export decrypted data** | **Exportar datos descifrados** |
| This will create an unencrypted copy of all your treasury data. **Anyone who can read the file can read your data.** Use this only when migrating away from OpenTreasury. | Esto creará una copia sin cifrar de todos los datos de tu tesorería. **Cualquiera que pueda leer el archivo podrá leer tus datos.** Úsalo solo si vas a migrar fuera de OpenTreasury. |
| [ Cancel ] [ Continue → enter recovery code ] | [ Cancelar ] [ Continuar → introducir código ] |

### Friction

- **Always requires the 12-word recovery code re-entry**, even though
  `safeStorage` could unlock the MK silently. Extra friction is the point: this
  is the one operation that turns the encrypted store into a plaintext blob on
  disk, so we want the user to consciously prove ownership.

### Output

- A ZIP file at a user-chosen path containing:
  - `events.ndjson` — plaintext NDJSON, one event per line. All device files
    are merged in ULID order and deduplicated by `event.id`.
  - `README.txt` — short explainer: file format, that the data is unencrypted,
    that re-importing isn't supported in v1.

i18n keys: `preferences.advanced.exportDecrypted.{title,warning,btn_cancel,btn_continue,recovery_prompt,success_toast}`.

## 8. Migration of Existing Trial Data

A subset of trial users already have a plaintext `events.ndjson` from
trial.3.7. On first launch of the encrypted build:

1. **Detect:** `events.ndjson` exists (single file, legacy format) AND
   `events.key` does not. → Route to migration flow.
2. **Screen 1 (Folder):** The workspace folder is already known (it's wherever
   the legacy file lives). Skip the folder picker — display the path for
   confirmation.
3. **Run the §5.2 setup flow** (Screens 2 → 2b → 3) as if new (generate MK,
   show recovery code, confirm).
4. **After Screen 2b confirmation passes — before Screen 3:**
   - Generate Pedro's `deviceId` (if not already generated in `device.json`).
   - Copy `events.ndjson` → `events.ndjson.pre-encryption.bak`.
   - Stream-read plaintext events. For each event, encrypt with MK, write to
     `events-{pedroDeviceId}.ndjson.tmp`.
   - Atomic rename `events-{pedroDeviceId}.ndjson.tmp` →
     `events-{pedroDeviceId}.ndjson`.
   - Write `events.key` (v2 format, with Pedro's device in `devices[]`).
   - Remove (or rename aside) the legacy `events.ndjson` to avoid confusion on
     next boot.
5. **Show Screen 3.**
6. **Delete `.pre-encryption.bak`** after the first successful encrypted append
   following migration (proves the new format is readable + writable end to
   end).

**`.pre-encryption.bak` lifecycle:** Created during migration only. Serves as a
safety net if something goes wrong with the encrypted format. Deleted
automatically after the first successful encrypted write post-migration. Never
recreated on subsequent launches. If the backup is found on a later boot without
a migration in progress, ignore it (stale artifact from a previous migration).

If migration fails at any step before the rename: leave the original
`events.ndjson` untouched, surface the error, do not advance past Screen 2b.
The user can retry on next launch.

**When Maria joins post-migration:** She installs, points at the OneDrive
folder, sees `events.key` → enters recovery code → enrolls → done. Her events
go to `events-{mariaDeviceId}.ndjson`. Pedro's migrated events are in
`events-{pedroDeviceId}.ndjson`. Both are readable by both devices.

## 9. File Layout Summary

### Workspace folder (cloud-synced, shared across devices)

| File | Contents | Lifecycle |
|------|----------|-----------|
| `events-{deviceId}.ndjson` | Encrypted event log for one device (one base64 ciphertext per line) | Created at first write for each enrolled device. One per device. |
| `events.key` | v2 key file: `devices[]` array + `wrap_recovery` + Argon2 params (JSON) | Created at fresh setup or migration. Updated on enrollment and recovery. |
| `workspace.json` | Workspace metadata: `workspaceId`, `datasetId`, `schemaVersion`, `createdAt` | Created at fresh setup. Read-only after creation. |
| `events.ndjson.pre-encryption.bak` | Pre-migration plaintext safety net | Migration only. Deleted after first successful encrypted append. |
| `events-{deviceId}.ndjson.tmp`, `events.key.tmp` | Atomic-write staging files | Transient; cleaned on success or stale-detected on next boot. |

### Per-machine (userData, NOT cloud-synced)

| File | Contents | Lifecycle |
|------|----------|-----------|
| `device.json` | `{ "deviceId": "<ULID>", "userId": "<ULID>", "workspacePath": "<path>" }` | Created at first launch. Never shared. Per-machine identity. |

## 10. Acceptance Criteria

- [ ] **AC1** — Fresh install (no `events.key`, no `events-*.ndjson`) shows the
  first-run flow. The dashboard route is unreachable until the setup completes.
- [ ] **AC2** — On Screen 2b, **[ Continue ]** is disabled until all three
  challenge words are correct (validated against the freshly generated mnemonic
  and the chosen positions).
- [ ] **AC3** — Closing the app on any screen **before** Screen 3 discards the
  in-memory MK. No `events.key` is written. Next launch begins a fresh first-run
  with newly generated 12 words.
- [ ] **AC4** — After successful first-run, each `events-{deviceId}.ndjson`
  contains only base64 ciphertext lines. No plaintext JSON token (`{`, `"id":`,
  `"type":`) appears anywhere in the file.
- [ ] **AC5** — Restarting the app on the same machine after first-run opens
  silently via the device's safeStorage wrap. No recovery prompt is shown.
  Time-to-dashboard is unaffected (within ±100 ms vs. unencrypted baseline).
- [ ] **AC6** — Triggering recovery (safeStorage fails) shows the recovery
  screen. Entering the correct 12 words unlocks the dashboard, and the device's
  entry in `devices[]` is added or updated with a refreshed `wrap_safestorage`.
- [ ] **AC7** — Wrong recovery code shows the inline error and allows retry.
  After 5 wrong attempts the "Contact support" line appears. The user is
  **never locked out**; attempt 6 still validates.
- [ ] **AC8** — Preferences → Advanced → Export decrypted requires re-entering
  the 12-word recovery code (even when safeStorage is available) and produces a
  ZIP containing a merged, deduplicated plaintext `events.ndjson` + `README.txt`.
- [ ] **AC9** — **Device enrollment via recovery code:** A second device pointing
  at the same workspace folder is routed to the Join flow. Entering the correct
  recovery code enrolls the device: a new entry appears in `events.key`
  `devices[]`, and the device unlocks silently on subsequent launches.
- [ ] **AC10** — **Concurrent write, no conflict copies:** Two devices writing
  events simultaneously produce no OneDrive/Dropbox conflict files for
  `events-*.ndjson` (each writes to its own file). Verified by creating events
  from two enrolled devices within a 1-minute window and checking for conflict
  file artifacts.
- [ ] **AC11** — **Merge-sort read correctness:** On app load, all events from
  all `events-{deviceId}.ndjson` files are merged in ULID order. Events from
  Device A and Device B appear interleaved by timestamp, not grouped by device.
- [ ] **AC12** — **Dedup by event.id:** If the same `event.id` appears in
  multiple device files (e.g., from a conflict-copy merge or replay scenario),
  only one copy is included in the read model.
- [ ] **AC13** — **`events.key` conflict-copy merge:** If OneDrive produces
  conflict copies of `events.key` (e.g., simultaneous enrollment), the app
  detects them, merges `devices[]` arrays by `deviceId` (union), and deletes the
  conflict files.
- [ ] **AC14** — **AAD binding uses `eventId + ":" + deviceId`:** Tampering with a ciphertext
  line (moving it to a different position or a different device file) causes
  AEAD verification failure. The AAD is `"{eventId}:{deviceId}"` (UTF-8 bytes),
  binding each ciphertext to the event's ULID and to the specific device file.
- [ ] **AC15** — Migration: launching the encrypted build over an existing
  trial-era plaintext `events.ndjson` preserves every event. Verified by
  (a) event count parity, and (b) SHA-256 of decrypted-and-reserialized events
  matching SHA-256 of the original plaintext lines.
- [ ] **AC16** — **Legacy cleanup post-migration:** After migration, the legacy
  `events.ndjson` is removed (or renamed aside). Only
  `events-{deviceId}.ndjson` files remain. The `.pre-encryption.bak` is deleted
  after first successful encrypted append.
- [ ] **AC17** — Per-event nonces are unique across all device files (verified
  by a test that rebuilds the nonce set on read and asserts no duplicates).
  Write path uses CSPRNG-generated 24-byte nonces with a same-process collision
  check.
- [ ] **AC18** — SPEC-025 status-based edit rules continue to work unchanged.
  Encryption is transparent to the read model: edit, status flip, and split
  invariants behave identically pre- and post-encryption.
- [ ] **AC19** — i18n strings exist in both `en` and `es` for every screen
  (folder picker, intro, show, confirm, done, join, recovery, export, errors).
  No hardcoded English in JSX.

---

> **⚠ SUPERSEDED (in-app UX):** The in-app migration UX described above (AC15,
> AC16 wizard flow) is **dropped**. Only the one-shot terminal script below
> ships for issue #308. The UI flow will not be implemented.

## The one-shot script (#308)

Pedro's 2 legacy (v1 plaintext) workspaces are migrated using a one-shot Node
script. There is **no in-app migration UI** — this is intentional. The code path
is dead after Pedro's 2 workspaces are migrated.

### Usage

```bash
node scripts/migrate-workspace.mjs <workspace-folder>
```

**Example:**

```bash
node scripts/migrate-workspace.mjs ~/OneDrive/opentreasury/pedro-workspace
```

### What the script does

1. Validates the workspace folder contains `events.ndjson` and is not already
   encrypted (`events.key` absent, no `events-*.ndjson` files).
2. Prompts for confirmation with a clear notice about what will happen.
3. Generates a **12-word BIP39 recovery phrase** and prints it in a framed
   warning block. Waits for ENTER before proceeding.
4. Generates a fresh ULID as the migration device ID.
5. Derives the recovery key via Argon2id (`m=65536 KiB, t=4, p=1`) and wraps
   the Master Key under it.
6. Writes `events.key` (v2 format) atomically with `mode 0o600` on POSIX.
7. Streams `events.ndjson` line-by-line, encrypts each event with
   `AAD = eventId + ":" + deviceId`, and writes to `events-{deviceId}.ndjson`.
8. After fsync and a read-back verification, renames the original to
   `events.ndjson.pre-encryption.bak`.
9. **The `.bak` file is never auto-deleted.** Pedro deletes it manually once
   confident the encrypted data is correct.

### Migration placeholder convention

The device entry written by the script sets `migration_placeholder: true` in
`events.key`. This is a structural discriminator with a precise contract:

- `wrap_safestorage` in migration entries is **not OS-encrypted material**. It
  contains the same ciphertext as `wrap_recovery` (recovery-key-wrapped MK) as
  a placeholder to satisfy the v2 schema's `devices[]` structure.
- Any code reading `events.key` **must** check `entry.migration_placeholder`
  before calling `safeStorage.decryptString()`. When `true`, skip the
  safeStorage path entirely and route through the re-enroll / recovery flow.
- Normal app-created device entries never have `migration_placeholder` set.
- The `DeviceWrap` Zod schema in `app/src/core/eventLog/keyFile.ts` declares
  this field as `migration_placeholder?: boolean` (optional) so the v2 schema
  accepts both migration and normal entries transparently.

### Scope note

This script is intended **solely for Pedro's 2 legacy workspaces**. It will not
be exposed in the app UI and is not part of the normal onboarding flow. New
workspaces created by the app are encrypted from the first event.

## 11. Performance Budget

**Read-model rebuild target: < 500 ms for 10 000 events.**

The read model is rebuilt from scratch on every app launch: glob all
`events-*.ndjson` files, decrypt each line, merge-sort by ULID, deduplicate by
`event.id`, feed to reducers.

**Why no caching in v1:** NGO datasets are small (< 5 000 events typical; 10 000
is a generous upper bound for the foreseeable future). At this scale, a full
rebuild is fast enough that snapshot cache adds complexity (cache invalidation
when another device's file changes) without meaningful UX gain. If profiling
shows the 500 ms budget is blown, a snapshot strategy becomes a separate spec.

**Device clock drift:** If two devices have significantly drifted clocks,
events will appear out of causal order in the read model. For an append-only
event log this is cosmetically annoying but not data-corrupting — the read model
folds all events regardless of order. Recommend documenting that "device clocks
should be roughly synchronized" (NTP, which Windows enables by default).

## 12. Out of Scope (deferred to future specs)

- **Per-user revocation, key rotation** — recovery code is the trust root;
  revoking requires MK rotation and re-encryption of all events.
- **Real-time collaboration / presence** — users see each other's changes on
  next app launch, not live.
- **Permission tiers** (read-only vs. editor) — all enrolled users are
  equal peers in v1.
- **Read-model snapshot cache** — always rebuild on launch (see §11).
- **Audit-trail UI** — event data records who did what (via `actorDeviceId` /
  `actorUserId`), but no view to browse it in v1.
- **Passphrase-based unlock** as an alternative to the mnemonic.
- **Hardware token support** (YubiKey, Trezor).
- **Escrow / admin-key recovery** services.
- **Encrypted backups** to cloud providers as a first-class feature.
- **Per-event AAD beyond `eventId + ":" + deviceId`** (e.g., dataset ID, tenant ID — not needed
  in the shared-workspace model).

## 13. Open Questions for Keaton

1. **Argon2id parameters.** Confirm `m = 64 MiB, t = 3, p = 1` lands ~500 ms on
   target hardware (mid-range 2020 NGO laptop, Windows 10/11). If too slow,
   tune down `m` first; if too fast (e.g., on M-series Macs), bump `t`. Whatever
   is chosen ships in `events.key.argon2_params` so old installs keep verifying
   with their original cost.
2. **Atomic write semantics for `events.key` on Windows.** Recommend
   `write tmp → fsync → rename` sequence on all three OSes. Confirm Windows
   `fs.rename` semantics over an existing file are atomic enough for our
   purposes, or whether we need the `Move-Item -Force` style two-step. Spec
   assumes single atomic rename.
3. **Read-model snapshot encryption.** When/if a snapshot file is added to speed
   cold boot, does it inherit the same per-event AEAD layer, get its own AEAD
   with the same MK, or is it considered derived data and left in plaintext (and
   therefore deletable/rebuildable)? If derived + plaintext, the snapshot path
   must be excluded from any "everything is encrypted" claims. **Recommend:
   separate spec when the snapshot lands.**

## 14. Riskiest Unknown

**OneDrive / SharePoint actual sync behavior with per-device files.**

The per-device file strategy eliminates write conflicts in theory — but we have
not verified that OneDrive reliably:

1. Syncs a new file (`events-{newDeviceId}.ndjson`) created by Device B so that
   Device A sees it on next glob.
2. Handles frequent small appends to different files without batching delays or
   producing phantom conflicts.
3. Propagates `events.key` updates (enrollment) without producing conflict copies
   in edge-case timing windows.

**Recommendation:** Allocate **1 day** explicitly for a cloud-sync smoke test on
actual OneDrive before committing to the final file strategy. Mock tests won't
catch the edge cases that matter. This smoke test should cover: new file
creation visibility, append propagation latency, and simultaneous enrollment
conflict-copy behavior.

**Second risk:** Merge-sort ordering with drifted clocks (see §11).

## 15. Estimate

*(Lifted from Keaton's multi-user redesign proposal, 2026-05-10)*

| Work item | Original (single-device) | Revised (multi-device) | Delta |
|-----------|--------------------------|------------------------|-------|
| Crypto module (MK gen, wrap/unwrap, AEAD) | 2–3 days | 3–4 days | Multi-wrap logic, device enrollment |
| First-run setup UI (fresh + join flows) | 2 days | 3 days | Join flow screens, detection logic |
| Recovery flow UI + detection | 1–2 days | 1–2 days | Minor: re-wrap adds to list |
| Migration (plaintext → encrypted, per-device rename) | 1 day | 1.5 days | File rename + legacy cleanup |
| EventLog adapter (per-device write, merge-sort read) | 1–2 days | 2–3 days | Glob, merge-sort, dedup |
| Export-decrypted escape hatch | 0.5 day | 0.5 day | Unchanged (reads all device files) |
| `events.key` conflict-copy detection & merge | — | 1 day | New |
| Integration testing + Switch review | 2 days | 3–4 days | Multi-device scenarios, cloud sync testing |
| **Total** | **~10–12 days** | **~14–18 days** | **+4–6 days** |

## 16. Traceability

- **Architecture input:** `.squad/decisions/inbox/keaton-spec-026-multiuser-redesign.md`
  (Keaton, 2026-05-10) — multi-user redesign proposal with D1–D5.
- **Superseded:** SPEC-026 v1 (single-device encryption, 2026-05-10) — replaced
  in its entirety by this multi-user-from-day-one design.
- **Pedro's decisions (2026-05-11):**
  1. Trusted board model, no per-user revocation in v1. Recovery code is the
     team enrollment secret.
  2. First user picks workspace folder via folder-picker (same UX as dataset
     chooser). No auto-default to OneDrive root. Join flow uses folder-picker
     to point at the same folder.
  3. No read-model snapshot cache in v1. Always rebuild from glob + merge-sort.
     Target < 500 ms for 10k events.
  4. No skip on first-run recovery confirmation (carried from v1).
  5. 12-word BIP39 mnemonic, not 24 (carried from v1).
  6. "Export decrypted" included in v1 (carried from v1).
  7. Guiding principle: "Security is non-negotiable" (carried from v1).
- **Schema confirmation:** `app/src/core/events/schemas.ts` lines 8–10 confirm
  `actorDeviceId`, `actorUserId`, and `actorIdentitySource` already exist in
  the event envelope. No schema changes needed.
- **Related specs:**
  - SPEC-025 (Status-based edit rules) — encryption is transparent to its
    behaviour; covered by AC18.
  - SPEC-023 (Split transactions) — same: read-model invariants unaffected.
- **Code touch points (anticipated, Trinity/Morpheus to confirm):**
  - `app/src/main/storage/JsonFileEventLog.ts` — per-device write, glob-based
    merge-sort read.
  - `app/src/main/crypto/` — new module for MK generation, multi-wrap, AEAD,
    Argon2id, enrollment.
  - `app/src/renderer/screens/Onboarding/Encryption/` — fresh setup +
    join flows.
  - `app/src/renderer/screens/Recovery/` — recovery screen.
  - `app/src/renderer/screens/Preferences/Advanced/ExportDecrypted/`.
  - `app/src/renderer/i18n/{en,es}/onboarding.json`, `recovery.json`,
    `preferences.json`.

## 17. Status History

| Date       | Status   | By    | Notes                                          |
|------------|----------|-------|------------------------------------------------|
| 2026-05-10 | Draft    | Niobe | v1: Initial draft (single-device). |
| 2026-05-12 | Proposed | Niobe | v2: Complete rewrite as multi-user-from-day-one. Supersedes v1. Incorporates Keaton's redesign (D1–D5), Pedro's 3 resolved questions. 3 open questions for Keaton carried forward. |
