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

test('API validates bearer tokens', async ({ page, request, apiHeaders }) => {
  expect((await request.get('/api/greeting')).status()).toBe(401);
  expect((await request.get('/api/greeting', { headers: { Authorization: 'Bearer forged' } })).status()).toBe(401);
  expect((await request.get('/api/greeting', { headers: apiHeaders })).status()).toBe(200);
});

test('Spring CSRF protection requires the cookie and matching header even with a bearer token', async ({ page, context, request, apiHeaders }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome, World' })).toBeVisible();
  const cookie = (await context.cookies()).find(value => value.name === '__Host-XSRF-TOKEN');
  expect(cookie).toMatchObject({ path: '/', secure: true, httpOnly: false, sameSite: 'Lax' });
  expect(await page.evaluate(() => document.cookie)).toContain('__Host-XSRF-TOKEN=');

  // Same-origin and authenticated still require CSRF proof.
  const headers = { ...apiHeaders, Origin: new URL(page.url()).origin };
  expect((await page.request.post('/api/greeting', { headers, data: {} })).status()).toBe(403);
  expect((await page.request.post('/api/greeting', { headers: { ...headers, 'X-XSRF-TOKEN': 'forged' }, data: {} })).status()).toBe(403);
  expect((await request.post('/api/greeting', { headers: { ...headers, 'X-XSRF-TOKEN': cookie!.value }, data: {} })).status()).toBe(403);

  // Passing CSRF reaches the controller mapping: this endpoint supports GET only.
  expect((await page.request.post('/api/greeting', { headers: { ...headers, 'X-XSRF-TOKEN': cookie!.value }, data: {} })).status()).toBe(405);
});
