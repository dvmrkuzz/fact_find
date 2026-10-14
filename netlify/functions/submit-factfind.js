const nodemailer = require('nodemailer');

// ─────────────────────────────────────────────────────────────────────────────
// ADVISER EMAIL ROUTING
// Add each adviser's email address below so submissions go straight to them
// as well as the onboarding inbox.
// The name on the LEFT must match the adviser name in the form exactly.
// Leave an address blank ('') and that adviser's submissions will go to the
// onboarding inbox only — nothing will break.
// ─────────────────────────────────────────────────────────────────────────────
const ADVISER_EMAILS = {
  'David Wells':     'david@trinitycapitalpartners.co.uk',
  'Russell Provan':  'russell@trinitycapitalpartners.co.uk',
  'Kevin Thomas':    'kevin@trinitycapitalpartners.co.uk',
  'Collin Bowman':   'collin.bowman@trinitycapitalpartners.co.uk',
  'Robert Saunders': 'robert@trinitycapitalpartners.co.uk',
  'Darryl Boulton':  'darryl@trinitycapitalpartners.co.uk'
};

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const {
    clientName, clientEmail, clientPhone, adviser, reference,
    netWorth, monthlySurplus, submittedAt,
    emailSubject, emailBody, pdfFilename, pdfBase64
  } = payload;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const pdfBuffer = Buffer.from(pdfBase64, 'base64');

  try {
    // ── Recipients ───────────────────────────────────────────────────────────
    // TEST_MODE=true  -> everything goes to TEST_EMAIL only. Real advisers and
    // the onboarding inbox are never contacted. Set this on the staging site.
    const testMode = String(process.env.TEST_MODE || '').toLowerCase() === 'true';
    const adviserInbox = ADVISER_EMAILS[adviser] || '';

    let recipients;
    if (testMode) {
      recipients = (process.env.TEST_EMAIL || process.env.SMTP_USER || '');
      if (!recipients) {
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: false, error: 'TEST_MODE is on but TEST_EMAIL is not set' })
        };
      }
    } else {
      recipients = [
        process.env.ADVISER_EMAIL,   // client onboarding inbox
        adviserInbox,                // the adviser the client selected (if mapped)
        process.env.SMTP_USER        // Gmail backup copy
      ].filter(Boolean).join(',');
    }

    const subjectLine = (emailSubject || `New Fact Find — ${clientName} (${reference})`);
    const finalSubject = testMode ? '[TEST] ' + subjectLine : subjectLine;
    const testBanner = testMode
      ? `<p style="background:#151d26;color:#fff;padding:12px 16px;font-size:15px;margin-bottom:16px;">
           <strong>TEST SUBMISSION — staging site</strong><br>
           This did not come from a real client. Intended adviser was: ${adviser || '—'}.
         </p>`
      : '';

    await transporter.sendMail({
      from: `"Trinity Fact Find${testMode ? ' (TEST)' : ''}" <${process.env.SMTP_USER}>`,
      to: recipients,
      subject: finalSubject,
      html: testBanner + emailBody,
      attachments: [{
        filename: (testMode ? 'TEST-' : '') + (pdfFilename || `Trinity-FactFind-${clientName}-${reference}.pdf`),
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, sentTo: recipients, testMode, via: 'smtp' })
    };
  } catch (err) {
    console.error('SMTP error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};