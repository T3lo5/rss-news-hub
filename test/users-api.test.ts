import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { createUser } from '../services/auth.service.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

let seq = 0;
function uniqueEmail(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}@test.com`;
}

async function createAdminToken(): Promise<string> {
  const email = uniqueEmail('users-admin');
  await createUser(email, 'senha12345', 'Users Admin', 'admin');
  const login = await request('POST', '/api/auth/login', { email, password: 'senha12345' });
  assert.strictEqual(login.status, 200, login.raw);
  return login.json.data.accessToken;
}

async function createUserToken(): Promise<string> {
  const email = uniqueEmail('users-viewer');
  await createUser(email, 'senha12345', 'Users Viewer', 'viewer');
  const login = await request('POST', '/api/auth/login', { email, password: 'senha12345' });
  assert.strictEqual(login.status, 200, login.raw);
  return login.json.data.accessToken;
}

describe('users API', () => {
  beforeEach(async () => {
    resetTestDb();
    await getTestDb();
  });

  test('requires authentication and admin role', async () => {
    const anon = await request('GET', '/api/users');
    assert.strictEqual(anon.status, 401, anon.raw);

    const userToken = await createUserToken();
    const forbidden = await request('GET', '/api/users', undefined, bearer(userToken));
    assert.strictEqual(forbidden.status, 403, forbidden.raw);
  });

  test('GET /api/users lists users without password hashes', async () => {
    const token = await createAdminToken();
    const res = await request('GET', '/api/users', undefined, bearer(token));
    assert.strictEqual(res.status, 200, res.raw);
    assert(Array.isArray(res.json.data));
    assert(res.json.data.length >= 1);
    for (const user of res.json.data) {
      assert.strictEqual(user.passwordHash, undefined);
      assert(user.id);
      assert(user.email);
      assert(user.role);
    }
  });

  test('POST /api/users creates a user with the requested role', async () => {
    const token = await createAdminToken();
    const email = uniqueEmail('created');
    const res = await request(
      'POST',
      '/api/users',
      { email, password: 'senha12345', name: 'Created', role: 'user' },
      bearer(token)
    );
    assert.strictEqual(res.status, 201, res.raw);
    assert.strictEqual(res.json.data.email, email);
    assert.strictEqual(res.json.data.role, 'user');
    assert.strictEqual(res.json.data.passwordHash, undefined);

    // The new user can log in.
    const login = await request('POST', '/api/auth/login', { email, password: 'senha12345' });
    assert.strictEqual(login.status, 200, login.raw);
  });

  test('POST /api/users rejects duplicates and invalid payloads', async () => {
    const token = await createAdminToken();
    const email = uniqueEmail('dup');
    await request('POST', '/api/users', { email, password: 'senha12345' }, bearer(token));
    const dup = await request(
      'POST',
      '/api/users',
      { email, password: 'senha12345' },
      bearer(token)
    );
    assert.strictEqual(dup.status, 409, dup.raw);

    const badRole = await request(
      'POST',
      '/api/users',
      { email: uniqueEmail('badrole'), password: 'senha12345', role: 'superadmin' },
      bearer(token)
    );
    assert.strictEqual(badRole.status, 400, badRole.raw);

    const shortPass = await request(
      'POST',
      '/api/users',
      { email: uniqueEmail('short'), password: '123' },
      bearer(token)
    );
    assert.strictEqual(shortPass.status, 400, shortPass.raw);
  });

  test('PUT /api/users/:id updates name, role and resets the password', async () => {
    const token = await createAdminToken();
    const email = uniqueEmail('target');
    const created = await request(
      'POST',
      '/api/users',
      { email, password: 'senha12345', name: 'Old' },
      bearer(token)
    );
    const id = created.json.data.id;

    const res = await request(
      'PUT',
      `/api/users/${id}`,
      { name: 'New Name', role: 'admin', password: 'newsenha123' },
      bearer(token)
    );
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.name, 'New Name');
    assert.strictEqual(res.json.data.role, 'admin');
    assert.strictEqual(res.json.data.passwordHash, undefined);

    const oldLogin = await request('POST', '/api/auth/login', { email, password: 'senha12345' });
    assert.strictEqual(oldLogin.status, 401, oldLogin.raw);

    const newLogin = await request('POST', '/api/auth/login', { email, password: 'newsenha123' });
    assert.strictEqual(newLogin.status, 200, newLogin.raw);
  });

  test('PUT /api/users/:id cannot change your own role', async () => {
    const token = await createAdminToken();
    const me = await request('GET', '/api/auth/me', undefined, bearer(token));
    const selfId = me.json.data.id;

    const res = await request('PUT', `/api/users/${selfId}`, { role: 'viewer' }, bearer(token));
    assert.strictEqual(res.status, 400, res.raw);
    assert.match(res.json.error, /own role/i);
  });

  test('DELETE /api/users/:id removes a user but not yourself', async () => {
    const token = await createAdminToken();
    const me = await request('GET', '/api/auth/me', undefined, bearer(token));

    const email = uniqueEmail('doomed');
    const created = await request(
      'POST',
      '/api/users',
      { email, password: 'senha12345' },
      bearer(token)
    );
    const id = created.json.data.id;

    const del = await request('DELETE', `/api/users/${id}`, undefined, bearer(token));
    assert.strictEqual(del.status, 200, del.raw);
    assert.strictEqual(del.json.data.deleted, true);

    const missing = await request('DELETE', `/api/users/${id}`, undefined, bearer(token));
    assert.strictEqual(missing.status, 404, missing.raw);

    const self = await request('DELETE', `/api/users/${me.json.data.id}`, undefined, bearer(token));
    assert.strictEqual(self.status, 400, self.raw);
  });
});
