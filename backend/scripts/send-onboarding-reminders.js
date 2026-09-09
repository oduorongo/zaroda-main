// Daily cron (see render.yaml: zaroda-onboarding-reminders) — emails the admin
// of any school that still hasn't finished setup (no classes, no teaching staff,
// or no learners) a reminder to continue, without anyone at ZARODA having to
// remember to send it manually from the owner Communication page.
//
// A brand-new signup gets a couple of days' grace before the first reminder,
// then reminders repeat every few days up to a cap — after that, someone still
// stuck probably needs a human follow-up rather than more automated email.
const { Client } = require('pg');

const GRACE_DAYS = 2;       // don't nag a school in its first couple of days
const REPEAT_DAYS = 4;      // wait this long between reminders to the same school
const MAX_REMINDERS = 5;    // stop automated reminders after this many; owner can still send manually

async function sendEmail(to, subject, html, text) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, detail: 'RESEND_API_KEY missing' };
  const from = process.env.RESEND_FROM || 'ZARODA SMS <onboarding@resend.dev>';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, html, text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }),
    });
    if (!resp.ok) return { ok: false, detail: `Resend error ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err?.message || 'Email send failed.' };
  }
}

function onboardingReminderEmail(adminFirstName, schoolName) {
  const text = `Dear ${adminFirstName},

You have already taken the first step by onboarding ${schoolName} to ZARODA SMS. Now, let's complete your setup!

Your account is ready, but some important setup steps are still incomplete. Completing them will allow you to fully benefit from ZARODA SMS.

With a fully set-up account, you can:
- Record and manage learner assessments
- Generate Schemes of Work, Lesson Plans and Lesson Notes
- Access learning videos through the Assessment Book
- Access Retooling resources for continuous professional development
- Use powerful analytics to understand learner performance and make informed decisions
- Send SMS directly to parents

Complete your setup today — log in and finish the remaining setup steps so you can start using the full power of ZARODA SMS.

https://app.zarodasolutions.app

Don't stop at onboarding — complete your setup and move from registration to real impact!

Thank you for choosing ZARODA Solutions.

ZARODA SOLUTIONS
INNOVATIVE. RELIABLE. FORWARD.`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <p>Dear ${adminFirstName},</p>
      <p>You have already taken the first step by onboarding <strong>${schoolName}</strong> to ZARODA SMS. Now, let&rsquo;s complete your setup!</p>
      <p>Your account is ready, but some important setup steps are still incomplete. Completing them will allow you to fully benefit from ZARODA SMS.</p>
      <p>With a fully set-up account, you can:</p>
      <ul style="padding-left: 20px; line-height: 1.8;">
        <li>✅ Record and manage learner assessments</li>
        <li>✅ Generate Schemes of Work, Lesson Plans and Lesson Notes</li>
        <li>✅ Access learning videos through the Assessment Book</li>
        <li>✅ Access Retooling resources for continuous professional development</li>
        <li>✅ Use powerful analytics to understand learner performance and make informed decisions</li>
        <li>✅ Send SMS directly to parents</li>
      </ul>
      <p style="margin-top: 24px;">
        <a href="https://app.zarodasolutions.app" style="background: #1a2e5a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
          Complete Your Setup Today
        </a>
      </p>
      <p>Log in and complete the remaining setup steps so you can start using the full power of ZARODA SMS.</p>
      <p><a href="https://app.zarodasolutions.app" style="color: #1a2e5a;">zarodasolutions.app</a></p>
      <p>Don&rsquo;t stop at onboarding&mdash;complete your setup and move from registration to real impact!</p>
      <p>Thank you for choosing <strong>ZARODA Solutions</strong>.</p>
      <p style="margin-top: 24px; color: #1a2e5a; font-weight: bold; letter-spacing: 0.5px;">
        ZARODA SOLUTIONS<br/>
        <span style="font-size: 12px; color: #666;">INNOVATIVE. RELIABLE. FORWARD.</span>
      </p>
    </div>`;

  return { html, text };
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Same "not fully set up" definition as the owner's manual reminder endpoint
  // (getIncompleteSetupTenants in stubs.module.ts) plus the grace/repeat/cap gating.
  const { rows: tenants } = await client.query(
    `SELECT t.id, t.name, t.setup_reminder_count AS "reminderCount",
            admin.admin_name  AS "adminName",
            admin.admin_email AS "adminEmail"
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT (u.first_name || ' ' || COALESCE(u.last_name,'')) AS admin_name, u.email AS admin_email
           FROM users u
          WHERE u.tenant_id = t.id AND u.role IN ('hoi','tenant_owner','school_admin')
          ORDER BY CASE u.role WHEN 'hoi' THEN 0 WHEN 'tenant_owner' THEN 1 ELSE 2 END
          LIMIT 1
       ) admin ON true
      WHERE t.account_type = 'school'
        AND t.created_at < NOW() - INTERVAL '${GRACE_DAYS} days'
        AND t.setup_reminder_count < ${MAX_REMINDERS}
        AND (t.last_setup_reminder_at IS NULL OR t.last_setup_reminder_at < NOW() - INTERVAL '${REPEAT_DAYS} days')
        AND (
          (SELECT COUNT(*) FROM streams  s WHERE s.tenant_id = t.id) = 0
          OR (SELECT COUNT(*) FROM users    u WHERE u.tenant_id = t.id AND u.role IN ('class_teacher','subject_teacher','overall_class_teacher')) = 0
          OR (SELECT COUNT(*) FROM learners l WHERE l.tenant_id = t.id AND l.is_active = true) = 0
        )
        AND admin.admin_email IS NOT NULL`,
  );

  console.log(`Found ${tenants.length} incomplete-setup school(s) due for a reminder.`);
  let sent = 0, failed = 0;
  for (const t of tenants) {
    const adminFirstName = (t.adminName || '').trim().split(/\s+/)[0] || 'there';
    const { html, text } = onboardingReminderEmail(adminFirstName, t.name);
    const result = await sendEmail(t.adminEmail, `Finish setting up ${t.name} on ZARODA`, html, text);
    if (result.ok) sent++; else { failed++; console.error(`Failed for ${t.name} (${t.adminEmail}): ${result.detail}`); }
    await client.query(
      `UPDATE tenants SET last_setup_reminder_at = NOW(), setup_reminder_count = setup_reminder_count + 1 WHERE id = $1`,
      [t.id],
    );
  }

  if (tenants.length) {
    await client.query(
      `INSERT INTO owner_broadcasts (audience, title, message, channel, recipient_count, sent, failed, sent_by, created_at)
       VALUES ('incomplete', 'Automatic setup reminder', 'Daily automated reminder to incomplete-setup schools', 'email', $1, $2, $3, NULL, NOW())`,
      [tenants.length, sent, failed],
    ).catch(() => null);
  }

  console.log(`Done — ${sent} sent, ${failed} failed.`);
  await client.end();
}

main().catch((err) => {
  console.error('Onboarding reminder job failed:', err);
  process.exit(1);
});
