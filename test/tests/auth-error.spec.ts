import { test, expect } from '../fixtures';

test('uses an HttpOnly session without browser OAuth tokens', async ({ page, context, request }) => {
  expect((await request.get('/api/greeting')).status()).toBe(401);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'O', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('oidc.') || key.startsWith('msal.')))).toEqual([]);
  expect((await context.cookies()).find(cookie => cookie.name === 'hello-test')?.httpOnly).toBe(true);
  const identity = await page.request.get('/oauth2/userinfo');
  expect(identity.ok()).toBeTruthy();
  expect(await identity.text()).not.toMatch(/access_token|refresh_token|id_token/);
  const internalPath = await page.request.get('/oauth2/auth');
  expect(internalPath.status()).not.toBe(202);
  expect(internalPath.headers()['authorization']).toBeUndefined();
});

test('rejects mutations with missing, null or sibling Origin', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'O', exact: true })).toBeVisible();
  for (const origin of [undefined, 'null', 'http://sibling.localhost:8150']) {
    const response = await page.request.post('/api/greeting', { headers: origin ? { Origin: origin } : {}, data: {} });
    expect(response.status()).toBe(403);
  }
});

test('renews the server-side session without browser navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'O', exact: true })).toBeVisible();
  const originalURL = page.url();
  await page.waitForTimeout(6100);
  const statuses = await page.evaluate(async () => Promise.all(Array.from({ length: 4 }, async () => (await fetch('/api/greeting')).status)));
  expect(statuses).toEqual([200, 200, 200, 200]);
  expect(page.url()).toBe(originalURL);
  const stats = await (await page.request.get('http://localhost:8050/test/stats')).json();
  expect(stats.refreshes).toBeGreaterThan(0);
});

test('the private Web client rejects an unassigned household user', async ({ page, request }) => {
  await request.post('http://localhost:8050/test/reset', { data: { user: 'family' } });
  try {
    const response = await page.goto('/');
    expect(response?.status()).toBe(403);
    expect((await page.request.get('/api/greeting')).status()).toBe(401);
  } finally {
    await request.post('http://localhost:8050/test/reset', { data: { user: 'owner' } });
  }
});

test('explicit sign-out removes the session and protected page content', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome, World' })).toBeVisible();
  await page.getByRole('button', { name: 'O', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign-in required' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome, World' })).toBeHidden();
  expect((await page.request.get('/api/greeting')).status()).toBe(401);
});
