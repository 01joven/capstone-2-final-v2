const nodemailer = require('nodemailer');

const sendVerificationCode = async (email, code, accountType = 'account') => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_APP_PASSWORD, SMTP_PASS } = process.env;
  const appPassword = (SMTP_APP_PASSWORD || SMTP_PASS || '').trim();

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !appPassword) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and either SMTP_APP_PASSWORD or SMTP_PASS in backend/.env.');
  }

  const port = Number(SMTP_PORT);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid TCP port.');
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: SMTP_USER,
      pass: appPassword.replace(/\s/g, ''),
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || SMTP_USER,
    to: email,
    subject: `Cogon Memorial Records System ${accountType} email verification code`,
    text: `Your one-time ${accountType} email verification code is ${code}.\n\nIt expires in 10 minutes. If you did not request this code, you can ignore this email.`,
    html: `<p>Your one-time ${accountType} email verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you did not request this code, you can ignore this email.</p>`,
  });
};

module.exports = { sendVerificationCode };
