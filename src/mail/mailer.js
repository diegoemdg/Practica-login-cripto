require("dotenv").config();
const nodemailer = require("nodemailer");

function parseMailFrom(value) {
  const fallback = {
    name: "Practica Criptografia",
    email: process.env.GMAIL_USER || process.env.SMTP_USER || "no-reply@example.com"
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

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), "utf8").toString("base64")}?=`;
}

function encodeBody(value) {
  return Buffer.from(String(value || ""), "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function formatAddress(address) {
  const name = String(address.name || "").replace(/"/g, '\\"');
  if (!name) return address.email;
  return `${encodeHeader(name)} <${address.email}>`;
}

function buildGmailRawMessage({ from, to, subject, text, html }) {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const message = [
    `From: ${formatAddress(from)}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeBody(text),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeBody(html),
    "",
    `--${boundary}--`
  ].join("\r\n");

  return toBase64Url(message);
}

function hasGmailApiConfig() {
  return Boolean(
    process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN &&
      process.env.GMAIL_USER
  );
}

async function getGmailAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail token error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Gmail token error: no se recibio access_token.");
  }

  return data.access_token;
}

async function sendMailWithGmailApi({ to, subject, text, html }) {
  const accessToken = await getGmailAccessToken();
  const sender = parseMailFrom(process.env.MAIL_FROM || process.env.GMAIL_USER);
  const raw = buildGmailRawMessage({
    from: sender,
    to,
    subject,
    text,
    html
  });

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ raw })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail send error ${response.status}: ${errorText}`);
  }
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
  if (hasGmailApiConfig()) {
    await sendMailWithGmailApi(message);
    return;
  }

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
