const nodemailer = require('nodemailer');

/**
 * Create a reusable Nodemailer transporter.
 *
 * In development, we use Ethereal (a free fake SMTP service) so emails
 * are captured for preview without requiring real SMTP credentials.
 *
 * In production, configure real SMTP via the SMTP_* env variables.
 */
let _transporter = null;

const getTransporter = async () => {
  if (_transporter) return _transporter;

  // Production / custom SMTP
  if (process.env.SMTP_HOST) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return _transporter;
  }

  // Development — auto-generate an Ethereal test account
  try {
    const testAccount = await nodemailer.createTestAccount();
    console.log(testAccount)
    _transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('📧 Ethereal test email account created:', testAccount.user);
    return _transporter;
  } catch (err) {
    console.error('Failed to create Ethereal test account, falling back to JSON transport:', err.message);
    // Absolute fallback — logs to console
    _transporter = nodemailer.createTransport({ jsonTransport: true });
    return _transporter;
  }
};

/**
 * Send an email. Returns the Nodemailer info object.
 * In development, the preview URL is logged to the console.
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = await getTransporter();

    const fromName = process.env.EMAIL_FROM_NAME || 'WorkSphere';
    const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'noreply@worksphere.dev';

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject,
      text: text || '',
      html,
    });

    // Log Ethereal preview URL in development
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('📧 Email preview URL:', previewUrl);
    }

    return info;
  } catch (error) {
    console.error('Email send error:', error.message);
    throw error;
  }
};

/**
 * Send an organization invitation email.
 *
 * @param {Object} params
 * @param {string} params.toEmail
 * @param {string} params.inviterName
 * @param {string} params.organizationName
 * @param {string} params.role
 * @param {string} params.inviteLink - Full URL the invitee can click
 * @param {boolean} params.isNewUser - Whether the invitee needs to set a password
 */
const sendInvitationEmail = async ({
  toEmail,
  inviterName,
  organizationName,
  role,
  inviteLink,
  isNewUser = false,
}) => {
  const subject = `You've been invited to join ${organizationName} on WorkSphere`;

  const passwordNote = isNewUser
    ? `<p style="color:#555;">Since this is your first time, you'll be asked to <strong>set a password</strong> when you accept the invitation.</p>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <tr>
      <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">WorkSphere</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Project Management Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px;">
        <h2 style="margin:0 0 16px;color:#1e293b;font-size:20px;">You're Invited! 🎉</h2>
        <p style="color:#334155;font-size:15px;line-height:1.6;">
          <strong>${inviterName}</strong> has invited you to join
          <strong>${organizationName}</strong> as a <strong>${role}</strong>.
        </p>
        ${passwordNote}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
          <tr>
            <td style="border-radius:8px;background:#6366f1;">
              <a href="${inviteLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                Accept Invitation
              </a>
            </td>
          </tr>
        </table>
        <p style="color:#94a3b8;font-size:13px;line-height:1.6;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${inviteLink}" style="color:#6366f1;word-break:break-all;">${inviteLink}</a>
        </p>
        <p style="color:#94a3b8;font-size:13px;">This invitation will expire in 7 days.</p>
      </td>
    </tr>
    <tr>
      <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">
          &copy; ${new Date().getFullYear()} WorkSphere. If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${inviterName} has invited you to join ${organizationName} as a ${role}.\n\nAccept the invitation: ${inviteLink}\n\nThis link expires in 7 days.`;

  return sendEmail({ to: toEmail, subject, html, text });
};

module.exports = {
  sendEmail,
  sendInvitationEmail,
};
