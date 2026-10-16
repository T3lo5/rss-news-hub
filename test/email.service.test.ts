import assert from 'node:assert';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { email } from '../server.config.js';
import {
  __resetTransport,
  __setCreateTransport,
  getEmailConfig,
  isEmailConfigured,
  sendEmail,
  verifyEmailConfig,
} from '../services/email.service.js';
import { markdownToHtml, renderEmailHtml } from '../services/markdown.js';

const ENV_EMAIL = structuredClone(email);

let sent: any[] = [];

function configureEmail(overrides: Record<string, unknown> = {}) {
  Object.assign(email, {
    enabled: true,
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    user: 'user@example.com',
    pass: 'secret',
    from: 'RSS News Hub <noreply@example.com>',
    recipients: ['dest@example.com'],
    ...overrides,
  });
}

describe('email.service', () => {
  beforeEach(() => {
    Object.assign(email, structuredClone(ENV_EMAIL));
    sent = [];
    __setCreateTransport(() => ({
      sendMail: async (opts: any) => {
        sent.push(opts);
        return { messageId: 'msg-1', accepted: [opts.to], rejected: [], response: '250 OK' };
      },
      verify: async () => true,
    }));
    __resetTransport();
  });

  afterEach(() => {
    Object.assign(email, structuredClone(ENV_EMAIL));
    __setCreateTransport();
  });

  test('getEmailConfig returns a copy of the live config', () => {
    configureEmail();
    const cfg = getEmailConfig();
    assert.strictEqual(cfg.host, 'smtp.example.com');
    cfg.host = 'mutated';
    assert.strictEqual(email.host, 'smtp.example.com');
  });

  test('isEmailConfigured requires enabled + host + from', () => {
    Object.assign(email, { ...structuredClone(ENV_EMAIL), enabled: true, host: '', from: '' });
    assert.strictEqual(isEmailConfigured(), false);

    configureEmail({ enabled: false });
    assert.strictEqual(isEmailConfigured(), false);

    configureEmail();
    assert.strictEqual(isEmailConfigured(), true);
  });

  test('sendEmail throws when email is not configured', async () => {
    Object.assign(email, { ...structuredClone(ENV_EMAIL), enabled: false, host: '' });
    await assert.rejects(() => sendEmail({ subject: 'x', text: 'y' }), /not configured/);
  });

  test('sendEmail throws when there are no recipients', async () => {
    configureEmail({ recipients: [] });
    await assert.rejects(() => sendEmail({ subject: 'x', text: 'y' }), /No email recipients/);
  });

  test('sendEmail sends to the configured recipients', async () => {
    configureEmail();
    const result = await sendEmail({ subject: 'Hello', text: 'Body', html: '<p>Body</p>' });

    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].to, 'dest@example.com');
    assert.strictEqual(sent[0].from, 'RSS News Hub <noreply@example.com>');
    assert.strictEqual(sent[0].subject, 'Hello');
    assert.strictEqual(sent[0].text, 'Body');
    assert.strictEqual(result.messageId, 'msg-1');
  });

  test('sendEmail accepts an explicit recipient override (array or csv)', async () => {
    configureEmail();
    await sendEmail({ to: ['a@example.com', 'b@example.com'], subject: 'x', text: 'y' });
    assert.strictEqual(sent[0].to, 'a@example.com, b@example.com');

    sent = [];
    await sendEmail({ to: 'c@example.com, d@example.com' as any, subject: 'x', text: 'y' });
    assert.strictEqual(sent[0].to, 'c@example.com, d@example.com');
  });

  test('verifyEmailConfig verifies the connection', async () => {
    configureEmail();
    assert.strictEqual(await verifyEmailConfig(), true);

    await assert.rejects(async () => {
      Object.assign(email, { ...structuredClone(ENV_EMAIL), enabled: false, host: '' });
      return verifyEmailConfig(email);
    }, /not configured/);
  });
});

describe('markdown helpers', () => {
  test('markdownToHtml converts headings, bold, links and lists', () => {
    const html = markdownToHtml('# Title\n\n**bold** and [link](https://x.com)\n\n- one\n- two');
    assert.ok(html.includes('<h1'));
    assert.ok(html.includes('<strong>bold</strong>'));
    assert.ok(html.includes('href="https://x.com"'));
    assert.ok(html.includes('<li'));
  });

  test('renderEmailHtml wraps the body in a document', () => {
    const html = renderEmailHtml('# Hi');
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(html.includes('Hi'));
  });
});
