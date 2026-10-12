const { Resend } = require('resend');

let resend = null;

const getResend = () => {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set in backend/.env.');
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set in backend/.env.');
  }
  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error('RESEND_FROM_EMAIL is not set in backend/.env.');
  }

  const r = getResend();
  const result = await r.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject,
    html,
    text,
  });
  return result;
};

module.exports = { sendEmail };
