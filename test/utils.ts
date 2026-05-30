import { Pool } from 'pg';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const MOCK_EMAIL_SERVER_URL = 'http://localhost:3055';

export const ALLOWED_EMAIL = 'test-user@example.com';

const pool = new Pool({
  host: 'localhost',
  port: 5451,
  database: 'test',
  user: 'postgres',
  password: 'postgres',
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function cleanupDb() {
  await query('DELETE FROM hello.auth_tokens');
  await query('DELETE FROM hello.greetings');
}

export async function populateDb() {
  await query(`
    INSERT INTO hello.greetings (name, message)
    VALUES ('World', 'Welcome to the skeleton app!')
    ON CONFLICT DO NOTHING
  `);
}

export async function cleanupDbRecords() {
  await query('DELETE FROM hello.auth_tokens');
  await query('DELETE FROM hello.greetings');
}

export async function insertGreeting(name: string, message: string) {
  await query('INSERT INTO hello.greetings (name, message) VALUES ($1, $2)', [name, message]);
}

export async function getGreetings() {
  const result = await query('SELECT * FROM hello.greetings ORDER BY id');
  return result.rows;
}

interface MockEmail {
  to: string;
  subject: string;
  link: string;
  receivedAt: string;
}

export async function resetMockEmailServer() {
  try {
    await fetch(`${MOCK_EMAIL_SERVER_URL}/reset`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.warn('Warning: Could not reset mock email server:', error);
  }
}

export async function getEmails(to: string): Promise<MockEmail[]> {
  const response = await fetch(
    `${MOCK_EMAIL_SERVER_URL}/messages?to=${encodeURIComponent(to)}`,
    { signal: AbortSignal.timeout(5000) }
  );
  return (await response.json()) as MockEmail[];
}

export async function waitForMagicLink(to: string): Promise<string> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const emails = await getEmails(to);
    if (emails.length > 0) {
      return emails[0].link;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No magic link email received for ${to}`);
}

export function emailInitials(email: string): string {
  return email
    .split('@')[0]
    .split(/[.\-_+]/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

// Performs the full magic-link sign-in flow in the browser, leaving the page
// authenticated on the home route.
export async function login(page: Page, email: string = ALLOWED_EMAIL) {
  await resetMockEmailServer();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send magic link' }).click();

  const link = await waitForMagicLink(email);
  const url = new URL(link);
  await page.goto(`${url.pathname}${url.search}`);
  await expect(
    page.getByRole('button', { name: emailInitials(email) })
  ).toBeVisible();
}
