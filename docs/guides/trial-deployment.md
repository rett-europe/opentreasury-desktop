# Trial Deployment Guide — OpenTreasury Desktop

> **For NGO admins and trial coordinators setting up OpenTreasury Desktop in your organization.**
>
> **Version:** Trial (v0.1) · **Last updated:** June 2026

---

## Overview

This guide walks you through installing and setting up OpenTreasury Desktop for your NGO's trial.
You'll configure a shared data location, set up individual user profiles, and manage who can write
(record) transactions vs. who can view only.

**Key principle for the trial:** Only **one person at a time** writes transactions to your dataset.
Others on your team can view the same transactions in **read-only mode**. When you need to switch
writers, you'll flip a setting—no conflict files, no merging hassles.

This works best for a small team (treasurer + 1–2 reviewers) auditing live transactions. For larger
teams or offline-first workflows, talk to us about what you need in v1.

---

## Part 1: Install and First Launch

### What you'll need

- **Windows 10 or later** (Mac/Linux coming soon).
- **OneDrive for Business** or **SharePoint** synced to your computer. (Personal OneDrive is **not**
  supported in the trial.)
- **A shared folder** where your team can store transaction data. This can be:
  - A folder in OneDrive for Business (e.g., `C:\Users\maria\OneDrive - MyNGO\Treasury`)
  - A SharePoint-synced folder (e.g., `C:\Users\maria\MyNGO-Sync\Treasury`)
- **Names and roles** for each team member (e.g., "Maria García — Treasurer", "Pablo López —
  Auditor").

### First install

1. **Download and install** OpenTreasury Desktop from [your organization's software portal].
2. **Launch the app.** You'll see a welcome screen.
3. **Fill in your profile:** Enter your name, select your role (Treasurer / Viewer / Auditor), and
   type your NGO name.
4. **Click "Continue."** The app saves your profile and opens the main panel.

That's it for the first person. The next section shows you how to point the app at your shared data
folder.

---

## Part 2: Choose Your Shared Data Location

### Why a shared folder?

OpenTreasury stores all transactions in a single file called `events.ndjson` (a plain-text log of
transaction records). By keeping this file on OneDrive or SharePoint, everyone on your team can open
the same data from their own laptops—no email, no USB drives, no guessing which version is newest.

### How to change your data folder

1. **Open the app** and go to **Settings** (usually a gear icon, top-right).
2. **Look for "Data folder"** — you'll see the current path (probably a local folder on your
   laptop).
3. **Click "Change…"** A folder picker opens.
4. **Navigate to your shared OneDrive or SharePoint folder.**
   - For OneDrive: look for `OneDrive - MyNGO` or similar.
   - For SharePoint: look for the synced site folder (it shows in your file system like a regular
     folder).
5. **Optional: Create a subfolder** called `Treasury` (or whatever you'd like) to keep things tidy.
6. **Click "OK"** to confirm. The app **restarts automatically** with the new folder.

### Example: Maria's setup

Maria is a treasurer at Rett Spain. She:

1. Goes to Settings → Data folder → Change.
2. Picks `C:\Users\maria\OneDrive - Rett Spain\Treasury`.
3. The app restarts, and now all her transactions will be stored in
   `C:\Users\maria\OneDrive - Rett Spain\Treasury\events.ndjson`.

### Important: Personal OneDrive is not supported

If you see a "Personal OneDrive" folder (sometimes labeled "OneDrive – Personal" or showing a
personal email), **don't use it.** The trial only supports:

- **OneDrive for Business** (your work or organization account)
- **SharePoint** team or site folders

If you accidentally pick Personal OneDrive, the app will show a clear message: "Personal OneDrive is
not supported in v0.1. Please pick a Business folder." Just go back and pick a different folder.

---

## Part 3: The One-Writer Rule

### What it means

In the trial, only **one person** writes (records or edits) transactions at a time. Everyone else
sees those transactions but **cannot add new ones or make changes**—they run in **read-only mode**.

Think of it like this:

- **Maria (writer)** — opens the shared folder on her laptop. She records expenses, approves
  transactions, makes changes.
- **Pablo (reviewer)** — opens the same shared folder on his laptop. He sees everything Maria
  recorded but can't add or edit anything. He can review, export, or run reports, but the "Add
  transaction" button is greyed out.

If both tried to write at the same time, you'd get conflicts and data loss. So the trial enforces:
**one writer, any number of readers.**

### How read-only mode works

When Pablo opens the shared Treasury folder on his laptop, the app detects that Maria is already
writing. It automatically puts Pablo in **read-only mode**:

- Pablo sees all transactions Maria has recorded.
- The "New transaction" button is disabled.
- At the top, a small banner says: "Read-only mode — another user is writing to this dataset."

### Switching the writer

When you want Pablo to become the writer instead (maybe Maria is done for the day):

**On Maria's laptop (the current writer):**

1. Open Settings.
2. Look for the **"Read-only mode"** toggle.
3. **Turn it ON.** Maria is now in read-only mode.

**On Pablo's laptop (the new writer):**

1. Open Settings.
2. **Turn OFF** the read-only mode toggle. (It might be on by default; flip it off.)
3. Pablo can now write transactions.

**That's it.** No restart needed, no file juggling. The app simply swaps roles.

### What happens if two people try to write at once?

This shouldn't happen if you follow the one-writer rule. But if it does (e.g., Maria forgets to
switch to read-only), the app stops one of you from writing and shows: "This dataset is being
written by another user. Switch to read-only mode in Settings."

If you see a conflict file with a name like `events-LAPTOP-MARIA.ndjson` in your shared folder, it
means two people wrote at the same time. This is a sign to:

1. **Stop immediately.** Ask both users to close the app.
2. **Contact us** for recovery steps. In the trial, we can help you consolidate the files.
3. **Pick one writer** and have the other switch to read-only before reopening.

---

## Part 4: Adding More Users to Your Team

### Each person sets up their own profile

Every team member needs to open the app on their own laptop and create a profile. Here's the flow:

1. **User installs the app** and launches it.
2. **Fills in their profile:** name, role (Treasurer / Viewer / Auditor), and your NGO name.
3. **Changes the data folder** (Part 2 above) to point to the shared OneDrive/SharePoint location.
4. **The app loads existing transactions** from your shared folder.
5. If the app detects someone else is writing, it **auto-enables read-only mode** for this user.

### Example: Rett Spain's team

1. **Maria (Treasurer)** — installs first, sets up her profile, changes data folder to the shared
   Treasury path. She's the writer.
2. **Pablo (Auditor)** — installs on his laptop, fills in his profile (name: Pablo, role: Auditor),
   changes data folder to the **same** Treasury path. The app detects Maria is writing and puts
   Pablo in read-only mode automatically.
3. **Sofia (Finance Assistant)** — same process. When she opens the app, read-only mode is already
   on (Maria is still writing).

All three see the same transactions, but only Maria can add or change anything.

### Roles explained

- **Treasurer:** Can write transactions, approve, audit.
- **Auditor:** Can review transactions, run reports, export. In the trial, this is functionally the
  same as Viewer (read-only).
- **Viewer:** Read-only access. Good for someone who just wants to check balances or reports.

Right now, the app doesn't enforce role-based permissions (that's v1). So whether you pick
"Treasurer" or "Viewer," your access is determined by the read-only flag in Settings. Think of the
role as a label for your team's records.

---

## Part 5: What to Expect (and What Not To)

### What's working in the trial

✅ **Transactions & movements** — record expenses and income, assign categories, add notes.  
✅ **Shared data folder** — keep your events file on OneDrive or SharePoint.  
✅ **Read-only multi-user** — one writer, others view safely.  
✅ **Basic analytics** — see saldo (balance), movement history, category breakdowns.  
✅ **Settings & data management** — change where your data lives, toggle read-only, see your
profile.

### What's deferred to v1 or later

❌ **Encryption at rest** — Your `events.ndjson` is stored as plain text. Not encrypted yet. (Coming
in v1; see Part 6: Encryption.)  
❌ **Role-based permissions** — Your role (Treasurer, Auditor) is recorded but doesn't restrict
actions yet.  
❌ **SSO / Active Directory** — No login with your work account (Graph/Entra ID) yet. Identity is
based on a local profile. (Coming in v1.)  
❌ **Undo / history revert** — Once a transaction is recorded, you can edit it but not fully delete
it. (Deletion is tracked in the audit log.)  
❌ **Bulk import from CSV** — Coming soon.  
❌ **Split transactions** (pending) — You can record one expense to one category; splitting across
multiple categories is coming.  
❌ **Mobile app** — Desktop only for now.

### Data starting fresh

The trial is a **fresh start.** If you've been testing OpenTreasury in the past, your old test data
is not carried over. (You can export it as CSV and re-import if needed, but that's a manual step
for v1.)

### Trial timeline

The trial typically runs **4–8 weeks.** During this time:

- Your data stays in the shared OneDrive/SharePoint folder.
- We collect your feedback on usability, missing features, bugs.
- At the end, you can export your transaction history as CSV.
- When v1 launches, we'll provide a migration path if you want to keep your trial data.

---

## Part 6: Encryption & Security (Trial Posture)

### Plain text for now

In the trial, your `events.ndjson` file is stored as **plain text**. If someone has access to your
OneDrive folder, they can read the file and see all transactions.

**Why?** Encryption adds complexity and slower startup. For the trial, we're prioritizing speed of
feedback over encryption. Real NGO data goes into v1 with full encryption (AEAD).

**What to do:**

- **Treat your OneDrive/SharePoint folder like a filing cabinet.** Limit access to people who
  should see all your treasury data.
- **Use your organization's normal OneDrive/SharePoint access controls.** Don't make it public.
- **Don't put sensitive employee or beneficiary names** in transaction notes if you're not
  comfortable with them being readable in plain text.

### Encryption in v1

When v1 launches later this year, all data at rest will be encrypted with **AEAD (Authenticated
Encryption with Associated Data).** Only people with the right cryptographic key can decrypt and
read. We'll provide a migration guide to move trial data into the encrypted v1 version.

---

## Part 7: Troubleshooting & FAQ

### "I can't add a transaction."

**Likely cause:** You're in read-only mode.

**Fix:**

1. Open **Settings**.
2. Look for **"Read-only mode"** toggle.
3. If it's ON, **turn it OFF** to become the writer.
4. If it's already OFF and the button is still greyed out, ask your writer to turn ON read-only
   mode first.

---

### "Where is my data stored?"

Your transactions are saved in a file called **`events.ndjson`** inside your data folder.

**To find it:**

1. Open **Settings** → **"Data folder"**.
2. You'll see the path (e.g., `C:\Users\maria\OneDrive - Rett Spain\Treasury`).
3. Open that folder in File Explorer.
4. Look for a file named `events.ndjson`.

**Don't edit this file by hand.** It's a machine-readable log. If you need to fix something, make
the change in the app, and it updates automatically.

---

### "We got a conflict file like `events-LAPTOP-MARIA.ndjson`."

**What happened:** Two people wrote transactions at the same time, and the system created a backup.

**Recovery steps:**

1. **Close the app on both laptops immediately.**
2. **Check the shared folder.** You'll see:
   - `events.ndjson` (main file)
   - `events-LAPTOP-MARIA.ndjson` (backup from Maria's laptop)
   - Maybe others, depending on who was writing.
3. **Look inside each file** (open in Notepad or a text editor) to see which one has the most recent
   transactions you want to keep.
4. **Pick the one with the newest, most important transactions.** Rename it to `events.ndjson`
   (overwrite the original if needed). Delete the others.
5. **Choose one person as the new writer.** Close the app on everyone else's laptop.
6. **Have the writer open the app first**, with read-only mode OFF.
7. **Everyone else opens the app with read-only mode ON.**

**To prevent this:** Only one person should have the app open with write access at a time. Use Part
3's switching process.

---

### "Can I use OneDrive Personal?"

**No.** OneDrive Personal is not supported in the trial.

**Supported locations:**

- ✅ OneDrive for Business (your work account)
- ✅ SharePoint team / site folders

**Why?** Personal OneDrive has different sync behavior and permission models. We've optimized for
Business and SharePoint. Personal support is planned for v1.x.

**If you picked Personal by accident:** The app will show a message: "Personal OneDrive is not
supported in v0.1." Go back, pick a OneDrive for Business or SharePoint folder, and try again.

---

### "Can I undo or delete a transaction?"

**Undo:** Not directly. But you can **edit** a transaction after it's recorded. Open the
transaction, change the details, and save.

**Delete:** Transactions are **not fully deleted** in the trial. When you mark a transaction as
deleted, it's recorded in the audit log so there's a record that it was removed and when. This is
intentional for audit compliance.

**If you need to remove a transaction:** Mark it as deleted in the app, and the audit log tracks
it. In v1, we'll have a full undo / deletion / recovery interface.

---

### "How do I export my data?"

**Coming soon.** In the trial, you can view transactions in the app but can't yet export to CSV or
PDF.

**Workaround:** In the meantime, if you need a snapshot of your data, take a screenshot of the
Movements screen or ask us for a manual export.

---

### "The app is slow / hangs when I open it."

**Likely cause:** Your `events.ndjson` file is very large (thousands of transactions).

**Quick fix:**

1. Check your data folder size. (Right-click the folder → Properties → Size.)
2. If `events.ndjson` is > 10 MB, close the app.
3. **Contact us** with the file size. We can help you optimize.

**For v1:** We're adding indexing and caching to speed up large datasets.

---

### "I'm on a Mac or Linux. When will that be supported?"

**Mac:** Early 2026 (target: late June).  
**Linux:** On the roadmap for v1.

For now, OpenTreasury Desktop is Windows-only.

---

### "What happens at the end of the trial?"

At the end of the trial (typically 4–8 weeks):

1. Your data stays in your OneDrive/SharePoint folder.
2. We'll send you a feedback survey and debrief.
3. If you want to continue to v1, we'll provide a **migration guide** to upgrade your trial data.
4. If not, your data is yours — export it, archive it, or delete it. It stays in your folder until
   you remove it.

---

## Part 8: Getting Help

**In-app help:** Look for a **"?"** icon or **"Help"** menu in the app. Links to docs and FAQs.

**Email support:** [support@opentreasury.org]

**Report a bug:** Go to
[our GitHub issues](https://github.com/rett-europe/opentreasury-desktop/issues) and describe what
went wrong. Include:

- Your OS (Windows 10 / 11)
- Steps to reproduce
- What you expected vs. what happened
- Your OneDrive/SharePoint sync status (working or syncing?)

**Feedback:** We'd love to hear what's working and what's not. You can reply to the trial email or
open a GitHub discussion.

---

## Summary Checklist

Before your team starts the trial:

- [ ] **All team members have Windows 10+** and OneDrive for Business or SharePoint access.
- [ ] **You've created a shared folder** (e.g., OneDrive for Business → Treasury).
- [ ] **First person (writer) has installed the app** and changed the data folder to the shared
      location.
- [ ] **Second and subsequent people have installed the app**, created their profiles, and changed
      the data folder to the **same** location.
- [ ] **One person is the "writer"** (read-only mode OFF); others have read-only mode ON.
- [ ] **You understand the one-writer rule** and how to switch writers (Part 3).
- [ ] **You know where your data is stored** and that it's plain-text (not encrypted yet).
- [ ] **You have a plan to contact us if something breaks** (email or GitHub).

---

## See Also

- **[UX-001: First-Run Setup](../ux/specs/ux-001-first-run-setup.md)** — Technical details on
  profile creation and folder validation.
- **[App Configuration](../architecture/)** — Developer notes on `app-config.json` and
  `profile.json` schemas (internal reference).
- **[Roadmap v1](../product/roadmap-v1.md)** — What's coming after the trial.
- **[Security Requirements](../security/security-requirements-v0.1.md)** — Security posture of the
  trial (internal reference).

---

**Last updated:** June 2026  
**Next review:** End of trial phase (estimated September 2026)
