import { test, expect } from '../fixtures';
import {
  ALLOWED_EMAIL,
  getEmails,
  login,
  waitForMagicLink,
} from '../utils';

test('redirects unauthenticated users to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Send magic link' })).toBeVisible();
});

test('signs in an allowed email via magic link', async ({ page }) => {
  await login(page, ALLOWED_EMAIL);
  await expect(page.getByRole('heading', { name: 'Welcome, World' })).toBeVisible();
});

test('does not send a magic link for a disallowed email', async ({ page }) => {
  const disallowed = 'intruder@example.com';

  await page.goto('/login');
  await page.getByLabel('Email').fill(disallowed);
  await page.getByRole('button', { name: 'Send magic link' }).click();

  // The confirmation message is shown regardless, to avoid disclosing the allowlist.
  await expect(page.getByText('Check your inbox')).toBeVisible();

  // But no email is actually delivered for a non-allowlisted address.
  await page.waitForTimeout(1000);
  const emails = await getEmails(disallowed);
  expect(emails).toHaveLength(0);
});

test('rejects an invalid magic link token', async ({ page }) => {
  await page.goto('/auth/verify?token=not-a-real-token');
  await expect(page.getByRole('heading', { name: 'Sign-in link invalid' })).toBeVisible();
});

test('rejects a magic link token that was already used', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ALLOWED_EMAIL);
  await page.getByRole('button', { name: 'Send magic link' }).click();

  const link = await waitForMagicLink(ALLOWED_EMAIL);
  const url = new URL(link);
  const tokenPath = `${url.pathname}${url.search}`;

  // First use signs in successfully.
  await page.goto(tokenPath);
  await expect(page.getByRole('button', { name: 'TU' })).toBeVisible();

  // Second use of the same token is rejected.
  await page.goto(tokenPath);
  await expect(page.getByRole('heading', { name: 'Sign-in link invalid' })).toBeVisible();
});
