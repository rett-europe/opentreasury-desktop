import { test, expect, _electron as electron } from '@playwright/test';

// Smoke test — verifies the Electron app boots and opens a window.
// Deliberately minimal: no feature assertions. Real flows live in feature specs.
// Requires `npm run build` first (dist/main/index.cjs must exist).
//
// Launch via `args: ['.']` so Electron reads our package.json (main →
// dist/main/index.cjs) and resolves app.getName() to "opentreasury-desktop",
// matching the perf spec and our documented launch pattern. Passing the file
// path directly bypasses package.json and silently breaks userData resolution.
test('app launches and opens a window', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  await expect(window).toBeTruthy();
  await app.close();
});
