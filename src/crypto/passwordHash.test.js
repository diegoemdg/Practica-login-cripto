const assert = require("assert");
const { hashPassword, verifyPassword, hashToken } = require("./passwordHash");

process.env.PASSWORD_PEPPER = "pepper-de-prueba";

const stored = hashPassword("Password123!");

assert.ok(stored.startsWith("sha3_256$"));
assert.equal(verifyPassword("Password123!", stored), true);
assert.equal(verifyPassword("Password123?", stored), false);
assert.equal(hashToken("abc"), hashToken("abc"));
assert.notEqual(hashToken("abc"), hashToken("abcd"));

console.log("OK: hash y verificacion funcionan.");
