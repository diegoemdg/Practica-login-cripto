const crypto = require("crypto");

const ALGORITHM = "sha3_256";
const DIGEST = "sha3-256";
const SALT_LENGTH = 16;

function getPepper() {
  return process.env.PASSWORD_PEPPER || "";
}

function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("La password debe tener al menos 8 caracteres.");
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto
    .createHash(DIGEST)
    .update(salt)
    .update(getPepper())
    .update(password)
    .digest();

  return [
    ALGORITHM,
    salt.toString("base64url"),
    hash.toString("base64url")
  ].join("$");
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 3 || parts[0] !== ALGORITHM) return false;

  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  const actual = crypto
    .createHash(DIGEST)
    .update(salt)
    .update(getPepper())
    .update(password)
    .digest();

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function randomCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashToken(value) {
  return crypto.createHash(DIGEST).update(String(value)).digest("base64url");
}

module.exports = {
  hashPassword,
  verifyPassword,
  randomToken,
  randomCode,
  hashToken
};
