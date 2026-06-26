require("dotenv").config();
const nodemailer = require("nodemailer");

function parseMailFrom(value) {
  const fallback = {
    name: "Practica Criptografia",
    email: process.env.SMTP_USER || "no-reply@example.com"
  };
  const text = String(value || "").trim();
  if (!text) return fallback;

  const match = text.match(/^(?:"?([^"<]*)"?\s*)?<([^<>]+)>$/);
  if (match) {
    return {
      name: match[1].trim() || fallback.name,
      email: match[2].trim()
    };
  }

  return {
    name: fallback.name,
    email: text
  };
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendMailWithBrevo({ to, subject, text, html }) {
  const sender = parseMailFrom(process.env.MAIL_FROM);
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${errorText}`);
  }
}

async function sendMailWithSmtp({ to, subject, text, html }) {
  const transporter = createTransport();
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
    html
  });
}

async function sendMail(message) {
  if (process.env.BREVO_API_KEY) {
    await sendMailWithBrevo(message);
    return;
  }

  await sendMailWithSmtp(message);
}

async function sendVerificationEmail({ email, userId, code }) {
  const verifyUrl = `${process.env.APP_URL}/verify.html?userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(email)}`;
  await sendMail({
    to: email,
    subject: "Verifica tu cuenta",
    text: `Hola ${userId}. Tu codigo de verificacion es ${code}. Entra aqui para escribirlo: ${verifyUrl}`,
    html: `
      <p>Hola <strong>${userId}</strong>.</p>
      <p>Tu codigo de verificacion es:</p>
      <h2>${code}</h2>
      <p>Escribe este codigo en la pagina de verificacion:</p>
      <p><a href="${verifyUrl}">Abrir pagina de verificacion</a></p>
      <p>El codigo expira en 15 minutos.</p>
    `
  });
}

async function sendResetEmail({ email, userId, token }) {
  const resetUrl = `${process.env.APP_URL}/reset-password.html?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: "Restablecer password",
    text: `Hola ${userId}. Cambia tu password aqui: ${resetUrl}`,
    html: `
      <p>Hola <strong>${userId}</strong>.</p>
      <p>Recibimos una solicitud para cambiar tu password.</p>
      <p><a href="${resetUrl}">Cambiar password</a></p>
      <p>Este enlace expira en 15 minutos. Si no fuiste tu, ignora este correo.</p>
    `
  });
}

module.exports = {
  sendVerificationEmail,
  sendResetEmail
};
