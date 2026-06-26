require("dotenv").config();
const express = require("express");
const path = require("path");
const { supabase } = require("./db/supabase");
const {
  hashPassword,
  verifyPassword,
  randomToken,
  randomCode,
  hashToken
} = require("./crypto/passwordHash");
const { sendVerificationEmail, sendResetEmail } = require("./mail/mailer");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function addMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (!body[field]) {
      const error = new Error(`Falta el campo: ${field}`);
      error.status = 400;
      throw error;
    }
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeUserId(userId) {
  return String(userId || "").trim();
}

async function createVerification(user) {
  const code = randomCode();
  const token = randomToken();

  await supabase
    .from("email_verifications")
    .delete()
    .eq("user_id", user.user_id)
    .is("consumed_at", null);

  const { error } = await supabase.from("email_verifications").insert({
    user_id: user.user_id,
    code_hash: hashToken(code),
    token_hash: hashToken(token),
    expires_at: addMinutes(15)
  });

  if (error) throw error;

  await sendVerificationEmail({
    email: user.email,
    userId: user.user_id,
    code
  });
}

app.post("/api/register", async (req, res, next) => {
  try {
    requireFields(req.body, ["userId", "email", "password"]);
    if (req.body.acceptedPrivacy !== true) {
      return res.status(400).json({ error: "Debes aceptar el aviso de privacidad." });
    }

    const user = {
      user_id: normalizeUserId(req.body.userId),
      email: normalizeEmail(req.body.email),
      password_hash: hashPassword(req.body.password),
      privacy_accepted_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("app_users")
      .insert(user)
      .select("user_id,email")
      .single();

    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "El ID o correo ya existe." });
      throw error;
    }

    await createVerification(data);
    res.status(201).json({ message: "Cuenta creada. Revisa tu correo para verificarla." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/verify-email", async (req, res, next) => {
  try {
    requireFields(req.body, ["userId", "code"]);
    const codeHash = hashToken(req.body.code);
    const userId = normalizeUserId(req.body.userId);

    const { data, error } = await supabase
      .from("email_verifications")
      .select("id,user_id,code_hash,expires_at,attempts,consumed_at")
      .eq("user_id", userId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(400).json({ error: "Codigo invalido o expirado." });
    if (data.attempts >= 5) return res.status(429).json({ error: "Demasiados intentos. Solicita otro codigo." });

    if (data.code_hash !== codeHash) {
      await supabase
        .from("email_verifications")
        .update({ attempts: data.attempts + 1 })
        .eq("id", data.id);
      return res.status(400).json({ error: "Codigo invalido o expirado." });
    }

    const now = new Date().toISOString();
    const { error: updateUserError } = await supabase
      .from("app_users")
      .update({ email_verified_at: now })
      .eq("user_id", data.user_id);
    if (updateUserError) throw updateUserError;

    const { error: updateVerificationError } = await supabase
      .from("email_verifications")
      .update({ consumed_at: now })
      .eq("id", data.id);
    if (updateVerificationError) throw updateVerificationError;

    res.json({ message: "Cuenta verificada correctamente." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/resend-verification", async (req, res, next) => {
  try {
    requireFields(req.body, ["email"]);
    const email = normalizeEmail(req.body.email);

    const { data: user, error } = await supabase
      .from("app_users")
      .select("user_id,email,email_verified_at")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;

    if (!user || user.email_verified_at) {
      return res.json({ message: "Si la cuenta existe y falta verificarla, enviaremos un correo." });
    }

    await createVerification(user);
    res.json({ message: "Si la cuenta existe y falta verificarla, enviaremos un correo." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    requireFields(req.body, ["userId", "password"]);
    const userId = normalizeUserId(req.body.userId);

    const { data: user, error } = await supabase
      .from("app_users")
      .select("user_id,email,password_hash,email_verified_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    if (!user || !verifyPassword(req.body.password, user.password_hash)) {
      return res.status(401).json({ error: "Credenciales invalidas." });
    }
    if (!user.email_verified_at) {
      return res.status(403).json({ error: "Verifica tu correo antes de iniciar sesion." });
    }

    const sessionToken = randomToken();
    const { error: sessionError } = await supabase.from("auth_sessions").insert({
      user_id: user.user_id,
      token_hash: hashToken(sessionToken),
      expires_at: addMinutes(60)
    });
    if (sessionError) throw sessionError;

    res.json({
      message: "Inicio de sesion correcto.",
      sessionToken,
      expiresInMinutes: 60
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/forgot-password", async (req, res, next) => {
  try {
    requireFields(req.body, ["email"]);
    const email = normalizeEmail(req.body.email);

    const { data: user, error } = await supabase
      .from("app_users")
      .select("user_id,email")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;

    if (user) {
      const token = randomToken();
      const { error: resetError } = await supabase.from("password_resets").insert({
        user_id: user.user_id,
        token_hash: hashToken(token),
        expires_at: addMinutes(15)
      });
      if (resetError) throw resetError;
      await sendResetEmail({ email: user.email, userId: user.user_id, token });
    }

    res.json({ message: "Si el correo esta registrado, recibiras un enlace para cambiar tu password." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reset-password", async (req, res, next) => {
  try {
    requireFields(req.body, ["token", "newPassword"]);
    const tokenHash = hashToken(req.body.token);

    const { data: reset, error } = await supabase
      .from("password_resets")
      .select("id,user_id,expires_at,consumed_at")
      .eq("token_hash", tokenHash)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw error;
    if (!reset) return res.status(400).json({ error: "Enlace invalido o expirado." });

    const now = new Date().toISOString();
    const { error: updateUserError } = await supabase
      .from("app_users")
      .update({ password_hash: hashPassword(req.body.newPassword) })
      .eq("user_id", reset.user_id);
    if (updateUserError) throw updateUserError;

    const { error: consumeError } = await supabase
      .from("password_resets")
      .update({ consumed_at: now })
      .eq("id", reset.id);
    if (consumeError) throw consumeError;

    await supabase
      .from("auth_sessions")
      .update({ revoked_at: now })
      .eq("user_id", reset.user_id)
      .is("revoked_at", null);

    res.json({ message: "Password actualizada. Ya puedes iniciar sesion." });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.message || "Error interno"
  });
});

app.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
});
