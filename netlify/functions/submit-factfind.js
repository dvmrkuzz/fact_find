const nodemailer = require('nodemailer');

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body)
  };
}

function formatSubmittedAt(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London'
    });
  } catch (e) { return String(iso); }
}

function buildEmailHtml(fields) {
  return `
<div style="font-family:Arial,sans-serif;font-size:15px;color:#151d26;max-width:600px;">
  <div style="background:#151d26;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
    <p style="color:#ff4a57;font-size:11px;letter-spacing:0.4em;font-weight:700;text-transform:uppercase;margin:0 0 8px;">GO BEYOND</p>
    <p style="color:#ffffff;font-size:20px;font-weight:700;margin:0;">New Client Fact Find</p>
  </div>
  <div style="background:#f5f6f8;padding:28px;border-radius:0 0 8px 8px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#6b7a8f;width:40%;">Name</td><td style="padding:8px 0;font-weight:600;">${fields.clientName}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7a8f;">Email</td><td style="padding:8px 0;">${fields.clientEmail || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7a8f;">Phone</td><td style="padding:8px 0;">${fields.clientPhone || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7a8f;">Adviser</td><td style="padding:8px 0;">${fields.adviser || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7a8f;">Reference</td><td style="padding:8px 0;font-family:monospace;">${fields.reference}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7a8f;">Net worth</td><td style="padding:8px 0;">${fields.netWorth || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7a8f;">Monthly surplus</td><td style="padding:8px 0;">${fields.monthlySurplus || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7a8f;">Submitted</td><td style="padding:8px 0;">${fields.submittedAt || '—'}</td></tr>
    </table>
    <div style="margin-top:20px;padding:16px;background:#ffffff;border-left:3px solid #ff4a57;border-radius:4px;">
      <p style="margin:0;color:#6b7a8f;font-size:13px;">Full details are in the attached PDF.</p>
    </div>
  </div>
</div>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const smtpUser     = (process.env.SMTP_USER     || '').trim();
  const smtpPass     = (process.env.SMTP_PASS     || '').trim();
  const adviserEmail = (process.env.ADVISER_EMAIL || '').trim();

  if (!smtpUser || !smtpPass || !adviserEmail) {
    return jsonResponse(500, { error: 'Email not configured — set SMTP_USER, SMTP_PASS and ADVISER_EMAIL in Netlify' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const { clientName, reference, pdfBase64 } = payload;
  if (!clientName || !reference || !pdfBase64) {
    return jsonResponse(400, { error: 'Missing required fields' });
  }

  const safeClientName = String(clientName).trim() || 'Client';
  const fields = {
    clientName:     safeClientName,
    clientEmail:    payload.clientEmail    ? String(payload.clientEmail).trim()    : '',
    clientPhone:    payload.clientPhone    ? String(payload.clientPhone).trim()    : '',
    adviser:        payload.adviser        ? String(payload.adviser).trim()        : '',
    reference:      String(reference).trim(),
    netWorth:       payload.netWorth       ? String(payload.netWorth)       : '',
    monthlySurplus: payload.monthlySurplus ? String(payload.monthlySurplus) : '',
    submittedAt:    formatSubmittedAt(payload.submittedAt)
  };

  const subject     = `New Fact Find — ${fields.clientName}${fields.adviser ? ' · ' + fields.adviser : ''} (${fields.reference})`;
  const pdfFilename = `Trinity-FactFind-${safeClientName.replace(/\s+/g, '-')}-${fields.reference}.pdf`;
  const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false }
    });

    await transporter.sendMail({
      from: `"Trinity Fact Find" <${smtpUser}>`,
      to: adviserEmail,
      subject,
      html: buildEmailHtml(fields),
      attachments: [{
        filename: pdfFilename,
        content:  cleanBase64,
        encoding: 'base64',
        contentType: 'application/pdf'
      }]
    });

    return jsonResponse(200, { ok: true, sentTo: [adviserEmail], via: 'smtp' });

  } catch (err) {
    console.error('SMTP failed:', err.message || err);
    return jsonResponse(500, { error: 'Failed to send email: ' + (err.message || 'Unknown error') });
  }
};