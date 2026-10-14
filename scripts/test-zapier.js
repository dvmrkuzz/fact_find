const fs = require('fs');
const path = require('path');

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

function buildEmailBody(fields) {
  const lines = [
    'New Client Fact Find',
    '',
    `Name: ${fields.clientName}`,
    `Email: ${fields.clientEmail || '—'}`,
    `Phone: ${fields.clientPhone || '—'}`,
    `Adviser: ${fields.adviser || '—'}`,
    `Reference: ${fields.reference}`,
    `Net worth: ${fields.netWorth || '—'}`,
    `Monthly surplus: ${fields.monthlySurplus || '—'}`,
    `Submitted: ${fields.submittedAt || '—'}`,
    '',
    'Full details are in the attached PDF.'
  ];
  return lines.join('\n');
}

loadEnvFile();

const webhookUrl = (process.env.ZAPIER_WEBHOOK_URL || '').trim();
const unifiedEmail = (process.env.UNIFIED_EMAIL || '').trim();

if (!webhookUrl || !unifiedEmail) {
  console.error('Missing ZAPIER_WEBHOOK_URL or UNIFIED_EMAIL in .env');
  process.exit(1);
}

if (webhookUrl.includes('hooks.zapier.com/hooks/catch/your')) {
  console.error('ZAPIER_WEBHOOK_URL is still the placeholder — paste your real Zapier Catch Hook URL.');
  process.exit(1);
}

const tinyPdfBase64 = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000102 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF\n'
).toString('base64');

const summary = {
  clientName: 'Test Client',
  clientEmail: 'test@example.com',
  clientPhone: '07123 456789',
  adviser: 'David Wells',
  reference: 'TEST-001',
  netWorth: '£100,000',
  monthlySurplus: '£500',
  submittedAt: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })
};

const payload = {
  ...summary,
  emailBody: buildEmailBody(summary),
  pdfBase64: tinyPdfBase64,
  pdfFilename: 'Trinity-FactFind-Test-Client-TEST-001.pdf',
  emailSubject: 'New Fact Find — Test Client · David Wells (TEST-001)',
  sendTo: unifiedEmail
};

console.log('Testing Zapier webhook...');
console.log('  URL:', webhookUrl.replace(/\/hooks\/catch\/[^/]+\/[^/]+\/.+/, '/hooks/catch/…'));
console.log('  To: ', unifiedEmail);

fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
  .then(async res => {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Zapier responded ${res.status}: ${text || '(empty)'}`);
    }
    console.log('Webhook accepted (' + res.status + ').');
    if (text) console.log('  Response:', text.slice(0, 200));
    console.log('Check Zapier — the Zap should have run. If email is set up, look in:', unifiedEmail);
  })
  .catch(err => {
    console.error('Zapier test failed:', err.message || err);
    process.exit(1);
  });
