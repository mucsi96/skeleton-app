import { test, expect } from '../fixtures';

test('follows a bootstrap redirect before starting Angular', async ({ page }) => {
  await page.route('**/api/environment?*', route => {
    const target = new URL(route.request().url()).searchParams.get('returnTo');
    expect(target).toBe('/?source=bookmark#section');
    return route.fulfill({ json: { redirectTo: '/test-login' } });
  });
  await page.route('**/test-login', route => route.fulfill({ contentType: 'text/html', body: 'Mock sign-in' }));
  await page.goto('/?source=bookmark#section');
  await expect(page).toHaveURL('/test-login');
  await expect(page.getByText('Mock sign-in')).toBeVisible();
});

test('API validates bearer tokens and rejects unsafe cross-origin requests', async ({ page, request, apiHeaders }) => {
  expect((await request.get('/api/greeting')).status()).toBe(401);
  expect((await request.get('/api/greeting', { headers: { Authorization: 'Bearer forged' } })).status()).toBe(401);
  expect((await request.get('/api/greeting', { headers: apiHeaders })).status()).toBe(200);
  for (const origin of [undefined, 'null', 'http://sibling.localhost:8150']) {
    const headers = { ...apiHeaders, ...(origin ? { Origin: origin } : {}) };
    expect((await request.post('/api/greeting', { headers, data: {} })).status()).toBe(403);
  }
});
