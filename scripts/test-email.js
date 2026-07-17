const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

function getOutlookSmtpHost(email) {
  const lower = String(email || '').toLowerCase();
  if (lower.endsWith('@outlook.com') || lower.endsWith('@hotmail.com') || lower.endsWith('@live.com')) {
    return 'smtp-mail.outlook.com';
  }
  return 'smtp.office365.com';
}

loadEnvFile();

const user = (process.env.OUTLOOK_USER || '').trim();
const pass = (process.env.OUTLOOK_PASSWORD || '').trim();
const to = (process.env.UNIFIED_EMAIL || '').trim();

if (!user || !pass || !to) {
  console.error('Missing OUTLOOK_USER, OUTLOOK_PASSWORD, or UNIFIED_EMAIL in .env');
  process.exit(1);
}

if (pass.includes('your-outlook-password') || pass.includes('your-mailbox-password')) {
  console.error('OUTLOOK_PASSWORD in .env is still the placeholder — paste your real app password.');
  process.exit(1);
}

const host = getOutlookSmtpHost(user);
const transporter = nodemailer.createTransport({
  host,
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user, pass },
  tls: { minVersion: 'TLSv1.2' }
});

console.log('Testing Outlook SMTP...');
console.log('  Host:', host);
console.log('  User:', user);
console.log('  To:  ', to);

transporter.verify()
  .then(() => {
    console.log('SMTP login OK — sending test email...');
    return transporter.sendMail({
      from: `"Trinity Fact Find Test" <${user}>`,
      to,
      subject: 'Trinity Fact Find — test email',
      text: 'If you received this, Outlook SMTP is working.'
    });
  })
  .then(() => {
    console.log('Test email sent successfully.');
  })
  .catch(err => {
    const msg = String(err.message || err);
    console.error('Email test failed:', msg);
    if (/smtpclientauthentication is disabled for the tenant|smtp_auth_disabled/i.test(msg)) {
      console.error('\nSMTP is turned OFF for the whole Trinity Microsoft 365 organisation.');
      console.error('An app password will not help — your IT admin must enable SMTP AUTH on the tenant.');
      console.error('Ask them: https://aka.ms/smtp_auth_disabled');
    } else if (/smtpclientauthentication is disabled for the mailbox/i.test(msg)) {
      console.error('\nSMTP is off for this mailbox. Ask IT to enable Authenticated SMTP on the mailbox.');
    } else if (err.responseCode === 535 || /auth/i.test(msg)) {
      console.error('\nLikely fix: use a Microsoft app password (not your normal login password).');
      console.error('https://account.microsoft.com/security → Advanced security → App passwords');
    }
    process.exit(1);
  });
