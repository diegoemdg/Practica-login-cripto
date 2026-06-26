require("dotenv").config();
const express = require("express");
const path = require("path");
const { supabase } = require("./db/supabase");
const {
  hashPassword,
  verifyPassword,
  randomToken,
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

async function findUserByIdOrEmail(userId, email) {
  const { data: byId, error: byIdError } = await supabase
    .from("app_users")
    .select("user_id,email,email_verified_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (byIdError) throw byIdError;

  if (byId) return byId;

  const { data: byEmail, error: byEmailError } = await supabase
    .from("app_users")
    .select("user_id,email,email_verified_at")
    .eq("email", email)
    .maybeSingle();
  if (byEmailError) throw byEmailError;

  return byEmail;
}

async function resendPendingVerification(userId, email, res) {
  const existingUser = await findUserByIdOrEmail(userId, email);

  if (!existingUser) {
    return res.status(409).json({ error: "El ID o correo ya existe." });
  }

  if (existingUser.user_id !== userId || existingUser.email !== email) {
    return res.status(409).json({ error: "El ID o correo ya existe." });
  }

  if (existingUser.email_verified_at) {
    return res.status(409).json({ error: "El ID o correo ya existe." });
  }

  await createVerification(existingUser);
  return res.status(200).json({
    message: "La cuenta ya existia sin verificar. Enviamos otro codigo a tu correo."
  });
}

async function createVerification(user) {
  await sendVerificationEmail({
    email: user.email,
    userId: user.user_id
  });
}

async function userFromSupabaseCallback({ accessToken, code }) {
  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error) throw error;
    return data.user;
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data.user;
  }

  const error = new Error("El enlace no trae token de Supabase.");
  error.status = 400;
  throw error;
}

async function createPasswordResetToken(email) {
  const { data: user, error } = await supabase
    .from("app_users")
    .select("user_id,email")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  if (!user) {
    const notFound = new Error("No existe una cuenta local para este correo.");
    notFound.status = 404;
    throw notFound;
  }

  const token = randomToken();
  const { error: resetError } = await supabase.from("password_resets").insert({
    user_id: user.user_id,
    token_hash: hashToken(token),
    expires_at: addMinutes(15)
  });
  if (resetError) throw resetError;

  return token;
}

app.get("/auth/callback", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Confirmando correo</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="auth">
      <section class="panel auth-panel">
        <h1>Confirmando correo</h1>
        <p id="status">Estamos validando el enlace de Supabase...</p>
      </section>
    </main>
    <script>
      (async () => {
        const status = document.getElementById("status");
        const search = new URLSearchParams(location.search);
        const hash = new URLSearchParams(location.hash.slice(1));
        const error = hash.get("error_description") || search.get("error_description");
        if (error) throw new Error(error);

        const response = await fetch("/api/auth-email-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: search.get("code") || "",
            accessToken: hash.get("access_token") || ""
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo validar el enlace.");
        location.replace(data.redirectTo || "/login.html");
      })().catch((error) => {
        document.getElementById("status").textContent = error.message;
      });
    </script>
  </body>
</html>`);
});

app.post("/api/auth-email-callback", async (req, res, next) => {
  try {
    const authUser = await userFromSupabaseCallback({
      accessToken: req.body.accessToken,
      code: req.body.code
    });
    const email = normalizeEmail(authUser && authUser.email);
    if (!email) {
      return res.status(400).json({ error: "Supabase no devolvio un correo valido." });
    }

    const { data: localUser, error: localUserError } = await supabase
      .from("app_users")
      .select("user_id,email_verified_at")
      .eq("email", email)
      .maybeSingle();
    if (localUserError) throw localUserError;
    if (!localUser) {
      return res.status(404).json({ error: "No existe una cuenta local para este correo." });
    }

    if (localUser.email_verified_at) {
      const token = await createPasswordResetToken(email);
      return res.json({
        redirectTo: `/reset-password.html?token=${encodeURIComponent(token)}`
      });
    }

    const { error } = await supabase
      .from("app_users")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("email", email)
      .select("user_id");
    if (error) throw error;

    res.json({ redirectTo: "/login.html?verified=1" });
  } catch (error) {
    next(error);
  }
});

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
      if (error.code === "23505") {
        return await resendPendingVerification(user.user_id, user.email, res);
      }
      throw error;
    }

    try {
      await createVerification(data);
    } catch (verificationError) {
      console.error("No se pudo enviar el correo de verificacion:", verificationError);
      await supabase.from("app_users").delete().eq("user_id", data.user_id);
      const detail = verificationError.message ? ` Detalle: ${verificationError.message}` : "";
      return res.status(502).json({
        error: `No se pudo enviar el correo de verificacion desde Supabase.${detail}`
      });
    }

    res.status(201).json({ message: "Cuenta creada. Revisa tu correo para verificarla." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/verify-email", async (req, res, next) => {
  try {
    res.status(410).json({
      error: "La verificacion ahora se completa dando clic al enlace enviado por Supabase."
    });
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
      await sendResetEmail({ email: user.email, userId: user.user_id });
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
