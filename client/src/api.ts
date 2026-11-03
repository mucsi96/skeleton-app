import { z } from 'zod';

export const greetingSchema = z.object({ name: z.string(), message: z.string(), aiGreeting: z.string() });
export const userInfoSchema = z.object({
  email: z.string(),
  preferredUsername: z.string().optional(),
  additionalClaims: z.object({ name: z.string().optional() }).optional(),
});

// OAuth credentials stay at the gateway. Only same-origin unsafe requests carry
// the readable CSRF proof, matching the API's host-only double-submit cookie.
export async function fetchJson<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('API requests must be same-origin');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes((init.method ?? 'GET').toUpperCase())) {
    const token = document.cookie.split(';').map(value => value.trim())
      .find(value => value.startsWith('__Host-XSRF-TOKEN='))?.split('=')[1];
    if (!token) throw new Error('Missing CSRF token');
    headers.set('X-XSRF-TOKEN', decodeURIComponent(token));
  }
  const response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return schema.parse(await response.json());
}
