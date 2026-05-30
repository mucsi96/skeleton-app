import { test, expect } from '../fixtures';
import { login } from '../utils';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('displays app title in header', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Skeleton App' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skeleton App' })).toHaveAttribute('href', '/');
});

test('shows user initials in header', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'TU' })).toBeVisible();
});

test('shows user email in popup', async ({ page }) => {
  await page.getByRole('button', { name: 'TU' }).click();
  await expect(page.getByText('test-user@example.com')).toBeVisible();
});

test('can sign out', async ({ page }) => {
  await page.getByRole('button', { name: 'TU' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Send magic link' })).toBeVisible();
});

test('displays greeting name from database', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Welcome, World' })).toBeVisible();
});

test('displays greeting message from database', async ({ page }) => {
  await expect(page.getByText('Welcome to the skeleton app!')).toBeVisible();
});

test('displays AI-generated greeting', async ({ page }) => {
  await expect(page.getByText('Hello World!')).toBeVisible();
});
