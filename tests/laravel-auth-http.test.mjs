import assert from 'node:assert/strict';
import test from 'node:test';

test('local Next.js and Laravel exchange session cookies and validate CSRF', { skip: !process.env.LARAVEL_AUTH_HTTP_URL }, async () => {
  const base = new URL(process.env.LARAVEL_AUTH_HTTP_URL);
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'HTTP integration tests are restricted to local servers');
  const endpoint = new URL('/api/auth/session', base);
  const state = await fetch(endpoint);
  assert.equal(state.status, 200);
  assert.deepEqual(await state.json(), { enabled: true, user: null });
  const cookies = state.headers.getSetCookie();
  assert.equal(cookies.some(value => value.startsWith('comparacel_backend_session=') && value.includes('httponly')), true, 'Private backend session cookie missing');
  const cookieHeader = cookies.map(value => value.split(';', 1)[0]).join('; ');
  const invalidIdentity = await fetch(endpoint, {
    method: 'POST', headers: { Origin: base.origin, Cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: 'invalid-test-token' }),
  });
  // 401 confirms the request passed Laravel CSRF validation and reached token validation.
  const rejected = await invalidIdentity.json();
  assert.equal(invalidIdentity.status, 401, rejected.error || 'Token validation was not reached');
  const foreignOrigin = await fetch(endpoint, {
    method: 'POST', headers: { Origin: 'https://untrusted.example', Cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: 'invalid-test-token' }),
  });
  assert.equal(foreignOrigin.status, 403);
  const logout = await fetch(endpoint, { method: 'DELETE', headers: { Origin: base.origin, Cookie: cookieHeader } });
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { enabled: true, user: null });
});
