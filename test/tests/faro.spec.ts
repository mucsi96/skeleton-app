import { test, expect } from '../fixtures';

test.use({ clientLogUrl: `${process.env.TEST_BASE_URL ?? 'http://localhost:8150'}/_telemetry/collect` });

test('sends Faro telemetry on the app origin without a CORS preflight', async ({ page }) => {
  const methods: string[] = [];
  await page.route('**/_telemetry/collect', async route => {
    methods.push(route.request().method());
    await route.fulfill({ status: 202, json: {} });
  });
  const delivered = page.waitForResponse(response => response.url().endsWith('/_telemetry/collect') && response.request().method() === 'POST');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome, World' })).toBeVisible();
  const response = await delivered;
  expect(response.status()).toBe(202);
  expect(new URL(response.url()).origin).toBe(new URL(page.url()).origin);
  expect(methods).not.toContain('OPTIONS');
});
