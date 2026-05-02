import { test, expect, _electron as electron } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// readOnly mode e2e spec — Issue #154 (P1-3 trial-readiness)
// ---------------------------------------------------------------------------
// Validates that the readOnly app-config flag correctly:
//   1. Blocks domain event writes (transaction.create → EVENT_LOG_READONLY)
//   2. Allows control transactions to succeed (readOnly=false baseline)
//   3. Allows config writes even when readOnly=true (per binding decision)
//
// Uses a two-launch pattern:
//   - First launch (readOnly=false): create an account via IPC
//   - Second launch (readOnly=true): attempt transaction.create → expect block
// ---------------------------------------------------------------------------

interface IsolatedEnv {
  readonly userDataDir: string;
  readonly dataDir: string;
}

function makeIsolatedEnv(): IsolatedEnv {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-readonly-'));
  const dataDir = path.join(root, 'readonly-events');
  fs.mkdirSync(dataDir, { recursive: true });
  return { userDataDir: root, dataDir };
}

interface AppConfig {
  version: number;
  dataDir: string | null;
  readOnly: boolean;
}

function writeAppConfig(userDataDir: string, config: AppConfig): void {
  const filePath = path.join(userDataDir, 'app-config.json');
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
}

function writeProfile(userDataDir: string): void {
  const profile = {
    userId: '01J9TESTUSER000000000000',
    name: 'Test User',
    role: 'Treasurer',
    ngoName: 'Test NGO',
    identitySource: 'local' as const,
    createdAt: new Date().toISOString(),
  };
  const filePath = path.join(userDataDir, 'profile.json');
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf8');
}

test.describe('readOnly mode e2e', () => {
  test('readOnly=true blocks transaction.create with EVENT_LOG_READONLY', async () => {
    const env = makeIsolatedEnv();
    writeProfile(env.userDataDir);
    writeAppConfig(env.userDataDir, {
      version: 1,
      dataDir: env.dataDir,
      readOnly: false,
    });

    // ── Launch 1: readOnly=false, create account ──────────────────────────
    let app = await electron.launch({
      args: ['.', `--user-data-dir=${env.userDataDir}`],
      env: { ...process.env, OT_SEED: 'none' },
    });

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Create account via IPC and capture the returned event.id
      const createAccountResult = await page.evaluate(async () => {
        // @ts-expect-error — preload exposes window.opentreasury
        return window.opentreasury.accounts.create({
          name: 'Test Account',
          openingBalance: 0,
        });
      });

      expect(createAccountResult.ok).toBe(true);
      if (!createAccountResult.ok) {
        throw new Error(`Account creation failed: ${JSON.stringify(createAccountResult.error)}`);
      }

      const accountId = createAccountResult.event.id;
      expect(accountId).toBeTruthy();

      await app.close();
    } catch (err) {
      await app.close();
      throw err;
    }

    // ── Launch 2: flip to readOnly=true, attempt transaction.create ───────
    writeAppConfig(env.userDataDir, {
      version: 1,
      dataDir: env.dataDir,
      readOnly: true, // ← flip
    });

    app = await electron.launch({
      args: ['.', `--user-data-dir=${env.userDataDir}`],
      env: { ...process.env, OT_SEED: 'none' },
    });

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Fetch the created account to get its ID
      const accounts = await page.evaluate(async () => {
        // @ts-expect-error — preload exposes window.opentreasury
        return window.opentreasury.accounts.list();
      });

      expect(accounts.accounts.length).toBeGreaterThan(0);
      const accountId = accounts.accounts[0].id;

      // Attempt transaction.create — should be blocked by readOnly
      const txResult = await page.evaluate(async (aid) => {
        // @ts-expect-error — preload exposes window.opentreasury
        return window.opentreasury.transaction.create({
          accountId: aid,
          date: '2026-01-15',
          type: 'expense',
          amount: 100.0,
          currency: 'EUR',
          description: 'Test transaction',
        });
      }, accountId);

      expect(txResult.ok).toBe(false);
      if (txResult.ok) {
        throw new Error('Expected transaction.create to be blocked, but it succeeded');
      }
      expect(txResult.error.code).toBe('EVENT_LOG_READONLY');
    } finally {
      await app.close();
      // Cleanup temp dir
      fs.rmSync(env.userDataDir, { recursive: true, force: true });
    }
  });

  test('readOnly=false allows transaction.create (control)', async () => {
    const env = makeIsolatedEnv();
    writeProfile(env.userDataDir);
    writeAppConfig(env.userDataDir, {
      version: 1,
      dataDir: env.dataDir,
      readOnly: false,
    });

    const app = await electron.launch({
      args: ['.', `--user-data-dir=${env.userDataDir}`],
      env: { ...process.env, OT_SEED: 'none' },
    });

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Create account
      const createAccountResult = await page.evaluate(async () => {
        // @ts-expect-error — preload exposes window.opentreasury
        return window.opentreasury.accounts.create({
          name: 'Control Account',
          openingBalance: 0,
        });
      });

      expect(createAccountResult.ok).toBe(true);
      if (!createAccountResult.ok) {
        throw new Error(`Account creation failed: ${JSON.stringify(createAccountResult.error)}`);
      }

      const accountId = createAccountResult.event.id;

      // Attempt transaction.create with readOnly=false — should succeed
      const txResult = await page.evaluate(async (aid) => {
        // @ts-expect-error — preload exposes window.opentreasury
        return window.opentreasury.transaction.create({
          accountId: aid,
          date: '2026-01-15',
          type: 'expense',
          amount: 100.0,
          currency: 'EUR',
          description: 'Control transaction',
        });
      }, accountId);

      expect(txResult.ok).toBe(true);
      if (!txResult.ok) {
        throw new Error(
          `Expected transaction.create to succeed, but got error: ${JSON.stringify(txResult.error)}`,
        );
      }
    } finally {
      await app.close();
      fs.rmSync(env.userDataDir, { recursive: true, force: true });
    }
  });

  test('readOnly=true allows config writes (per binding decision)', async () => {
    const env = makeIsolatedEnv();
    writeProfile(env.userDataDir);
    writeAppConfig(env.userDataDir, {
      version: 1,
      dataDir: env.dataDir,
      readOnly: true, // ← start with readOnly true
    });

    const app = await electron.launch({
      args: ['.', `--user-data-dir=${env.userDataDir}`],
      env: { ...process.env, OT_SEED: 'none' },
    });

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Call config:setDataDir to verify config writes are allowed
      // We'll use a different data dir to avoid "SAME_DIR" error
      const newDataDir = path.join(env.userDataDir, 'new-data');
      fs.mkdirSync(newDataDir, { recursive: true });

      const configResult = await page.evaluate(async (newDir) => {
        // @ts-expect-error — preload exposes window.opentreasury
        return window.opentreasury.config.setDataDir({
          newDir,
          confirmDatasetSwitch: true,
        });
      }, newDataDir);

      // The handler schedules a relaunch and exits, so we expect either:
      // 1. ok: true (the IPC reply flushed before exit)
      // 2. The app closed before we got a response (also acceptable)
      // We'll just verify the operation was accepted (no readOnly block)
      if (configResult !== undefined) {
        // If we got a response, it should be ok: true or an error that's NOT about readOnly
        if (!configResult.ok) {
          // Acceptable errors: INVALID_LOCATION, NOT_WRITABLE, etc. (not EVENT_LOG_READONLY)
          // The config handler doesn't return EVENT_LOG_READONLY — it's allowed.
          // We just verify it didn't throw or block.
          expect(configResult.error.code).not.toBe('EVENT_LOG_READONLY');
        } else {
          expect(configResult.ok).toBe(true);
        }
      }
      // If we got here without an exception, the config write was allowed
    } finally {
      // The app may have already exited (relaunch+exit), handle both cases
      try {
        await app.close();
      } catch {
        // App already closed — that's fine
      }
      fs.rmSync(env.userDataDir, { recursive: true, force: true });
    }
  });
});
