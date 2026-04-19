import { test, expect, _electron as electron } from '@playwright/test';

// Scaffold smoke test — verifies the Electron app boots and opens a window.
// Deliberately minimal: no feature assertions yet. Real flows arrive with feature PRs.
//
// TODO: wire this once `npm install` + `vite build` + `tsc -b` have been run at least once.
// Skipped until the main bundle exists at dist/main/index.js.
test.skip('app launches and opens a window', async () => {
  const app = await electron.launch({ args: ['dist/main/index.js'] });
  const window = await app.firstWindow();
  await expect(window).toBeTruthy();
  await app.close();
});
