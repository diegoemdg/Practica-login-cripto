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
3. Si existe, pide a Supabase Auth que envie un enlace al correo.
4. El usuario abre el enlace de Supabase.
5. El backend valida el enlace y genera un token aleatorio propio.
6. En la base de datos solo guarda el hash de ese token.
7. El usuario escribe una nueva password.
8. El backend calcula el hash de la nueva password.
9. Reemplaza `app_users.password_hash`.
10. Marca el token como usado y revoca sesiones anteriores.

## Donde esta en el codigo

### Solicitar enlace

Archivo: `src/server.js`

Ruta:

```js
app.post("/api/forgot-password", async (req, res, next) => {
```

Parte importante:

```js
await sendResetEmail({ email: user.email, userId: user.user_id });
```

Esto pide a Supabase Auth que mande el enlace por correo.

### Validar enlace de Supabase

Archivo: `src/server.js`

Ruta:

```js
app.post("/api/auth-email-callback", async (req, res, next) => {
```

Cuando el usuario abre el enlace, el backend valida el token de Supabase, identifica el correo y genera el token temporal propio:

```js
const token = await createPasswordResetToken(email);
```

Ese token se guarda hasheado en `password_resets` y se manda al formulario de cambio de password.

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
- Supabase Auth: envia los correos de verificacion y recuperacion.

No necesitas Gmail, Brevo ni SMTP para que el enlace llegue al usuario.
