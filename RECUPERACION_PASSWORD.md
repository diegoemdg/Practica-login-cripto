# Como funciona la recuperacion de password

La recuperacion esta hecha para que **nadie pueda ver la password anterior**. Esto es intencional y correcto.

## Por que no se revela la password anterior

La password original nunca se guarda. Cuando el usuario se registra, el servidor calcula un hash con:

```text
SHA3-256 + sal aleatoria + pepper
```

El resultado se guarda en `app_users.password_hash`.

Un hash no se puede descifrar para volver a la password original. Por eso la recuperacion correcta no es "mandar tu password", sino permitir crear una nueva.

## Flujo implementado

1. El usuario escribe su correo en "Restablecer password".
2. El backend busca si existe una cuenta con ese correo.
3. Si existe, genera un token aleatorio.
4. En la base de datos solo guarda el hash de ese token.
5. El token real se envia al correo dentro de un enlace.
6. El usuario abre el enlace y escribe una nueva password.
7. El backend calcula el hash de la nueva password.
8. Reemplaza `app_users.password_hash`.
9. Marca el token como usado.
10. Revoca sesiones anteriores.

## Donde esta en el codigo

### Solicitar enlace

Archivo: `src/server.js`

Ruta:

```js
app.post("/api/forgot-password", async (req, res, next) => {
```

Parte importante:

```js
const token = randomToken();
await supabase.from("password_resets").insert({
  user_id: user.user_id,
  token_hash: hashToken(token),
  expires_at: addMinutes(15)
});
await sendResetEmail({ email: user.email, userId: user.user_id, token });
```

Esto genera el token, guarda su hash en Supabase y manda el enlace por correo.

### Cambiar password

Archivo: `src/server.js`

Ruta:

```js
app.post("/api/reset-password", async (req, res, next) => {
```

Parte importante:

```js
const tokenHash = hashToken(req.body.token);
```

Con eso el servidor compara el token recibido contra el hash guardado en la tabla `password_resets`.

Luego cambia la password:

```js
await supabase
  .from("app_users")
  .update({ password_hash: hashPassword(req.body.newPassword) })
  .eq("user_id", reset.user_id);
```

Aqui no se recupera la anterior. Se crea un nuevo hash y reemplaza el anterior.

Despues marca el enlace como usado:

```js
await supabase
  .from("password_resets")
  .update({ consumed_at: now })
  .eq("id", reset.id);
```

Y revoca sesiones anteriores:

```js
await supabase
  .from("auth_sessions")
  .update({ revoked_at: now })
  .eq("user_id", reset.user_id)
  .is("revoked_at", null);
```

### Funcion hash de password

Archivo: `src/crypto/passwordHash.js`

Funcion:

```js
function hashPassword(password) {
```

Usa:

```js
crypto.createHash("sha3-256")
  .update(salt)
  .update(getPepper())
  .update(password)
  .digest()
```

### Funcion hash de token

Archivo: `src/crypto/passwordHash.js`

Funcion:

```js
function hashToken(value) {
  return crypto.createHash("sha3-256").update(String(value)).digest("base64url");
}
```

Para esta practica se usa SHA3-256 porque el objetivo es demostrar el concepto pedido en clase. En produccion se recomienda una funcion especializada para passwords como Argon2id, bcrypt, scrypt o PBKDF2.

## Tecnologias necesarias

Minimo necesitas:

- Node.js: ejecuta el backend.
- Express: crea las rutas `/api/...`.
- Supabase: base de datos PostgreSQL.
- Nodemailer: envia correos por SMTP.
- Un proveedor SMTP: Mailtrap, Gmail con app password, Outlook, SendGrid, etc.

No necesitas una tecnologia extra para la recuperacion, pero si necesitas un servicio de correo real para que el enlace llegue al usuario.
