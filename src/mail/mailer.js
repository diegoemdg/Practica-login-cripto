require("dotenv").config();
const { supabase } = require("../db/supabase");

function appUrl() {
  return String(process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`)
    .trim()
    .replace(/\/+$/, "");
}

function callbackUrl(mode) {
  return `${appUrl()}/auth/callback?mode=${encodeURIComponent(mode)}`;
}

async function sendVerificationEmail({ email, userId }) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: callbackUrl("verify"),
      data: {
        user_id: userId
      }
    }
  });

  if (error) throw error;
}

async function sendResetEmail({ email }) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: callbackUrl("reset")
    }
  });

  if (error) throw error;
}

module.exports = {
  sendVerificationEmail,
  sendResetEmail
};
