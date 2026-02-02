require('dotenv').config();

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const VERIFICATION_EMAIL = process.env.VERIFICATION_EMAIL;


async function sendEmail({ to, subject, htmlContent, textContent, sender }) {
  const { TransactionalEmailsApi, SendSmtpEmail } = await import('@getbrevo/brevo');
  const api = new TransactionalEmailsApi();

  api.authentications.apiKey.apiKey = BREVO_API_KEY;

  const sendSmtpEmail = new SendSmtpEmail();
  sendSmtpEmail.sender = sender ? { name: sender.name, email: sender.email } : { name: 'FC', email: 'noreply@amfphub.com' };
  sendSmtpEmail.to = [{ email: to.email, name: to.name || to.email }];
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent || undefined;
  sendSmtpEmail.textContent = textContent || undefined;

  const data = await api.sendTransacEmail(sendSmtpEmail);
  return data;
}

const sendOtpEmail = async (email, otp) => {
  const htmlContent = `
    <p>Your OTP is ${otp}</p>
  `
  const textContent = `
    Your OTP is ${otp}
  `
  await sendEmail({ to: { email }, subject: 'OTP Verification', htmlContent, textContent, sender: { name: 'FC', email: VERIFICATION_EMAIL } })
}

module.exports = { sendOtpEmail };