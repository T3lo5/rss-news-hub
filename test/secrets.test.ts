import assert from 'node:assert';
import { describe, test } from 'node:test';
import { decryptSecret, encryptSecret, isEncrypted } from '../services/secrets.js';

describe('secrets', () => {
  test('encrypts and decrypts a value roundtrip', () => {
    const secret = 'sk-very-secret-123';
    const enc = encryptSecret(secret);

    assert.ok(isEncrypted(enc));
    assert.notStrictEqual(enc, secret);
    assert.ok(!enc.includes(secret));
    assert.strictEqual(decryptSecret(enc), secret);
  });

  test('produces a unique ciphertext per call (random IV)', () => {
    const a = encryptSecret('same-value');
    const b = encryptSecret('same-value');

    assert.notStrictEqual(a, b);
    assert.strictEqual(decryptSecret(a), 'same-value');
    assert.strictEqual(decryptSecret(b), 'same-value');
  });

  test('empty values stay empty and are not encrypted', () => {
    assert.strictEqual(encryptSecret(''), '');
    assert.strictEqual(encryptSecret(null), '');
    assert.strictEqual(encryptSecret(undefined), '');
    assert.strictEqual(decryptSecret(''), '');
    assert.strictEqual(decryptSecret(null), '');
  });

  test('does not double-encrypt an already encrypted value', () => {
    const enc = encryptSecret('abc');
    assert.strictEqual(encryptSecret(enc), enc);
  });

  test('passes through legacy plaintext values unchanged', () => {
    assert.strictEqual(decryptSecret('plain-token'), 'plain-token');
    assert.ok(!isEncrypted('plain-token'));
  });

  test('returns empty string for tampered ciphertext instead of throwing', () => {
    const enc = encryptSecret('abc');
    const tampered = `${enc.slice(0, -4)}AAAA`;

    assert.strictEqual(decryptSecret(tampered), '');
  });
});
