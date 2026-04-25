import { test, expect, _electron as electron } from '@playwright/test';

// Smoke test — verifies the Electron app boots and opens a window.
// Deliberately minimal: no feature assertions. Real flows live in feature specs.
// Requires `npm run build` first (dist/main/index.js must exist).
test('app launches and opens a window', async () => {
  const app = await electron.launch({ args: ['dist/main/index.js'] });
  const window = await app.firstWindow();
  await expect(window).toBeTruthy();
  await app.close();
});
