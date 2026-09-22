require('dotenv').config();

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@amfphub.com';

async function sendEmail({ to, subject, htmlContent, textContent, sender }) {
  const { TransactionalEmailsApi, SendSmtpEmail } = await import('@getbrevo/brevo');
  const api = new TransactionalEmailsApi();

  api.authentications.apiKey.apiKey = BREVO_API_KEY;

  const senderEmail = (sender?.email && !sender.email.includes('example.com'))
    ? sender.email
    : BREVO_SENDER_EMAIL.includes('example.com')
      ? 'noreply@amfphub.com'
      : BREVO_SENDER_EMAIL;

  const sendSmtpEmail = new SendSmtpEmail();
  sendSmtpEmail.sender = { name: sender?.name || 'FC', email: senderEmail };
  sendSmtpEmail.to = [{ email: to.email, name: to.name || to.email }];
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent || undefined;
  sendSmtpEmail.textContent = textContent || undefined;

  try {
    return await api.sendTransacEmail(sendSmtpEmail);
  } catch (err) {
    const brevoMessage = err?.response?.body || err?.response?.data || err.message;
    console.error('Brevo send email failed:', brevoMessage);
    throw err;
  }
}

const sendOtpEmail = async (email, otp) => {
  const htmlContent = `
    <p>Your OTP is ${otp}</p>
  `
  const textContent = `
    Your OTP is ${otp}
  `
  await sendEmail({ to: { email }, subject: 'OTP Verification', htmlContent, textContent, sender: { name: 'FC', email: BREVO_SENDER_EMAIL } })
}

const sendPasswordResetOtpEmail = async (email, otp) => {
  const htmlContent = `
    <p>Your password reset code is <strong>${otp}</strong></p>
    <p>This code expires in 15 minutes. If you did not request a reset, ignore this email.</p>
  `
  const textContent = `
    Your password reset code is ${otp}
    This code expires in 15 minutes. If you did not request a reset, ignore this email.
  `
  await sendEmail({
    to: { email },
    subject: 'Password Reset',
    htmlContent,
    textContent,
    sender: { name: 'FC', email: BREVO_SENDER_EMAIL },
  })
}

module.exports = { sendOtpEmail, sendPasswordResetOtpEmail };
