import { test, expect } from '../fixtures';

test('displays app title in browser tab', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Hello');
});

test('displays app title in header', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Skeleton App' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skeleton App' })).toHaveAttribute('href', '/');
});

test('shows user initials in header', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'O', exact: true })).toBeVisible();
});

test('shows user name in the profile menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'O', exact: true }).click();
  await expect(page.getByText('Owner', { exact: true })).toBeVisible();
});

test('displays greeting name from database', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome, World' })).toBeVisible();
});

test('displays greeting message from database', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Welcome to the skeleton app!')).toBeVisible();
});

test('displays AI-generated greeting', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Hello World!')).toBeVisible();
});
