import { test as base, TestInfo } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { cleanupDbRecords, insertGreeting } from './utils';

export const test = base.extend<{ apiHeaders: Record<string, string>; clientLogUrl: string }>({
  clientLogUrl: ['', { option: true }],
  apiHeaders: async ({ request }, use) => {
    const issuer = process.env.TEST_OAUTH2_URL ?? 'http://localhost:8050';
    const redirect = 'http://localhost/test';
    const authorization = await request.get(`${issuer}/default/authorize`, {
      params: { client_id: 'test-client', redirect_uri: redirect, response_type: 'code' },
      maxRedirects: 0,
    });
    const code = new URL(authorization.headers()['location']).searchParams.get('code')!;
    const tokens = await request.post(`${issuer}/default/token`, {
      form: { grant_type: 'authorization_code', client_id: 'test-client', redirect_uri: redirect, code },
    });
    if (!tokens.ok()) throw new Error(`Mock token request failed: ${tokens.status()}`);
    await use({ Authorization: `Bearer ${(await tokens.json()).access_token}` });
  },
  page: async ({ page, apiHeaders, clientLogUrl }, use, testInfo: TestInfo) => {
    await cleanupDbRecords();
    await insertGreeting('World', 'Welcome to the skeleton app!');

    // Stand in for the gateway's verified identity; no proxy/session stack in app tests.
    await page.route('**/api/**', route => route.continue({ headers: { ...route.request().headers(), ...apiHeaders } }));
    await page.route('**/oauth2/userinfo', route => route.fulfill({ json: { email: 'owner@example.test', additionalClaims: { name: 'Owner' } } }));
    await page.route('**/*', async route => {
      if (!route.request().isNavigationRequest()) return route.fallback();
      const response = await route.fetch();
      const body = (await response.text()).replace(/["']__APP_CONFIG_JSON__["']/, JSON.stringify({
        clientLogUrl, clientAppName: 'hello-client',
      }));
      const headers = { ...response.headers() };
      delete headers['content-length'];
      delete headers['content-encoding'];
      await route.fulfill({ response, headers, body });
    });

    // Reset mock AI server
    try {
      await fetch('http://localhost:3050/reset', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      console.warn('Warning: Could not reset mock AI server:', error);
    }

    // Capture browser console logs
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      const location = msg.location();
      const timestamp = new Date().toISOString();
      consoleLogs.push(
        `[${timestamp}] [${type.toUpperCase()}] ${text} (${location.url}:${location.lineNumber})`
      );
    });

    page.on('pageerror', (error) => {
      const timestamp = new Date().toISOString();
      consoleLogs.push(`[${timestamp}] [PAGE_ERROR] ${error.message}\n${error.stack}`);
    });

    // Now expose the page to tests
    await use(page);

    // Save console logs on test failure
    if (testInfo.status !== testInfo.expectedStatus && consoleLogs.length > 0) {
      const outputDir = testInfo.outputDir;
      mkdirSync(outputDir, { recursive: true });
      const logPath = join(outputDir, 'console-logs.txt');
      writeFileSync(logPath, consoleLogs.join('\n'));
      testInfo.attachments.push({
        name: 'console-logs',
        path: logPath,
        contentType: 'text/plain',
      });
    }
  },
});

export { expect } from '@playwright/test';
