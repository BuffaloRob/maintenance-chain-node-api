import nodemailer from 'nodemailer';
import config from './config.js';

// The emails sent in tests, which keep them here instead.
export const outbox = [];

let transport;

export async function sendMail({ to, subject, text }) {
  const message = { from: config.mailFrom, to, subject, text };
  if (config.env === 'test') {
    outbox.push(message);
  } else if (config.smtpUrl) {
    transport ??= nodemailer.createTransport(config.smtpUrl);
    await transport.sendMail(message);
  } else {
    // Development without SMTP_URL. (In production the server won't start.)
    console.log(`Email to ${to}: ${subject}\n\n${text}`);
  }
}
