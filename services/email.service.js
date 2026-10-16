// SMTP delivery via nodemailer.
//
// The effective config lives in the mutable `email` object from
// server.config.js (populated from .env) and is overlaid at boot by
// services/settings.service.js with the admin-editable, encrypted values
// persisted in app_settings.
import nodemailer from 'nodemailer';
import { email as emailConfig } from '../server.config.js';

export function getEmailConfig() {
  return { ...emailConfig };
}

export function isEmailConfigured(config = emailConfig) {
  return Boolean(config && config.enabled !== false && config.host && config.from);
}

function toAddressList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

// Transporter cache: rebuilt only when the relevant connection fields change.
let cachedTransporter = null;
let cachedKey = '';

// Test seam: lets the suite inject a fake transport instead of real SMTP.
let createTransport = (opts) => nodemailer.createTransport(opts);

function getTransporter(config = emailConfig) {
  const key = [config.host, config.port, config.secure, config.user, config.pass].join('|');
  if (cachedTransporter && cachedKey === key) return cachedTransporter;

  cachedTransporter = createTransport({
    host: config.host,
    port: config.port,
    secure: Boolean(config.secure),
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
  cachedKey = key;
  return cachedTransporter;
}

export async function sendEmail(payload, config = emailConfig) {
  if (!isEmailConfigured(config)) {
    throw new Error('Email is not configured (set SMTP host and From in Settings)');
  }

  const { subject, text, html } = payload || {};
  const recipients = toAddressList(payload?.to).length
    ? toAddressList(payload.to)
    : toAddressList(config.recipients);

  if (!subject) throw new Error('Email subject is required');
  if (recipients.length === 0) throw new Error('No email recipients configured');
  if (!(text || html)) throw new Error('Email body is required');

  const info = await getTransporter(config).sendMail({
    from: config.from,
    to: recipients.join(', '),
    subject,
    text,
    html,
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted || recipients,
    rejected: info.rejected || [],
    response: info.response,
  };
}

// Validate the SMTP connection (used by the "Test connection" action).
export async function verifyEmailConfig(config = emailConfig) {
  if (!isEmailConfigured(config)) {
    throw new Error('Email is not configured (set SMTP host and From in Settings)');
  }
  await getTransporter(config).verify();
  return true;
}

// Test-only hook: drop the memoized transporter after changing the config.
export function __resetTransport() {
  cachedTransporter = null;
  cachedKey = '';
}

// Test-only hook: inject a fake transport factory.
export function __setCreateTransport(factory) {
  createTransport = factory || ((opts) => nodemailer.createTransport(opts));
  __resetTransport();
}
