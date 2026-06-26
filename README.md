# Practica: inicio de sesion con criptografia

Este proyecto implementa un login propio para una practica de criptografia:

- Registro con `ID`, `correo` y `password`.
- Aviso de privacidad y consentimiento.
- Hash de password con `SHA3-256`, sal aleatoria y pepper.
- Verificacion de cuenta por codigo o enlace enviado por correo.
- Recuperacion segura de cuenta mediante enlace para cambiar la password.
- Base de datos propia en Supabase/PostgreSQL.

## Investigacion: que datos podemos solicitar

Para esta practica solo conviene pedir:

| Dato | Justificacion |
| --- | --- |
| ID o nombre de usuario | Identifica la cuenta dentro del sistema. Puede ser matricula, alias o identificador escolar. |
| Correo electronico | Permite verificar que la persona controla un medio de contacto y enviar enlaces de recuperacion. |
| Password | Permite autenticar, pero nunca se guarda en texto claro. Se guarda un hash con sal. |

No se deben pedir datos sensibles como origen racial, estado de salud, religion, opiniones politicas, preferencia sexual, domicilio o telefono si no son necesarios para la finalidad de la practica.

## Relacion con la Ley de Proteccion de Datos Personales

En Mexico aplica la **Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares** para sujetos privados que tratan datos personales. El texto vigente de la Camara de Diputados indica que su objeto es regular el tratamiento legitimo, controlado e informado para garantizar privacidad y autodeterminacion informativa. Tambien define datos personales como informacion de una persona identificada o identificable.

Principios relevantes para esta practica:

- **Licitud y consentimiento:** informar al usuario y obtener aceptacion del aviso de privacidad.
- **Finalidad:** usar ID, correo y password solo para crear, verificar, autenticar y recuperar la cuenta.
- **Proporcionalidad:** pedir solo los datos necesarios.
- **Informacion:** poner disponible el aviso de privacidad.
- **Seguridad:** proteger los datos contra acceso, perdida, alteracion o tratamiento no autorizado.
- **Derechos ARCO:** permitir acceso, rectificacion, cancelacion y oposicion cuando aplique.

Fuentes consultadas:

- Camara de Diputados, Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares, texto vigente: https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf
- NIST SP 800-63B, almacenamiento de passwords con sal y hash resistente a ataques offline: https://pages.nist.gov/800-63-4/sp800-63b.html
- OWASP Password Storage Cheat Sheet, recomienda Argon2id/bcrypt/PBKDF2 y advierte que SHA-256 simple no es adecuado para passwords: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Supabase Docs, Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security

## Nota criptografica importante

Aunque a veces se dice "cifrar la password", para login no se debe cifrar con una llave reversible. Se debe guardar un **hash lento con sal**, porque el sistema no necesita recuperar la password original, solo verificar que la password escrita produce el mismo resultado.

Esta practica usa:

```text
SHA3-256
sal aleatoria por usuario
pepper secreto en variable de entorno
comparacion en tiempo constante
```

Para una aplicacion real seria mejor usar Argon2id, bcrypt, scrypt o PBKDF2. En esta practica se usa SHA3-256 porque el objetivo es demostrar el concepto de hash solicitado en la materia.

El formato guardado en la base de datos es:

```text
sha3_256$SALT_BASE64URL$HASH_BASE64URL
```

## Flujo de funcionamiento

1. El usuario se registra con ID, correo, password y acepta el aviso de privacidad.
2. El servidor genera una sal, calcula el hash y guarda el usuario en `app_users`.
3. El servidor genera codigo de 6 digitos y token de enlace.
4. En la base solo se guarda el hash del codigo y el hash del token.
5. El usuario verifica con el codigo o dando click en el enlace.
6. El login solo funciona si el correo ya fue verificado.
7. Si olvida la password, solicita un enlace.
8. El enlace permite establecer una nueva password; no se recupera la anterior.

## Configuracion de Supabase

Guia paso a paso: `SUPABASE_PASOS.md`.

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor**.
3. Ejecuta el archivo `database.sql`.
4. Ve a **Project Settings > API**.
5. Copia `Project URL` y `service_role key`.
6. Crea un archivo `.env` copiando `.env.example`.
7. Llena tus datos de Supabase y SMTP.

La `SUPABASE_SERVICE_ROLE_KEY` solo debe vivir en el servidor. Nunca se coloca en HTML, JavaScript del navegador ni repositorios publicos.

## Instalacion

Para abrir el proyecto en VS Code, abre el archivo:

```text
practica-login-criptografia.code-workspace
```

Tambien puedes abrir la carpeta completa `practica-login-criptografia`.

```bash
npm install
cp .env.example .env
npm run test:hash
npm run dev
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
npm run test:hash
npm run dev
```

Luego abre:

```text
http://localhost:3000
```

## Endpoints principales

| Metodo | Ruta | Uso |
| --- | --- | --- |
| POST | `/api/register` | Crea cuenta y envia correo de verificacion. |
| POST | `/api/verify-email` | Verifica con `token` o con `userId + code`. |
| POST | `/api/resend-verification` | Reenvia codigo si falta verificar. |
| POST | `/api/login` | Inicia sesion y crea token de sesion. |
| POST | `/api/forgot-password` | Envia enlace para cambiar password. |
| POST | `/api/reset-password` | Cambia password con token temporal. |

## Aviso de privacidad breve para la practica

El responsable de esta practica recaba ID, correo electronico y password con la finalidad de crear una cuenta, verificar el correo, permitir el inicio de sesion y restablecer la password. La password no se almacena en texto claro; se almacena mediante un hash criptografico con sal. Los datos no se usaran para finalidades distintas ni se compartiran con terceros. La persona titular puede solicitar acceso, rectificacion, cancelacion u oposicion al tratamiento de sus datos mediante el correo de contacto definido por el equipo.

## Recuperacion de password

La explicacion completa esta en `RECUPERACION_PASSWORD.md`.

Resumen: la password anterior no se puede revelar porque nunca se guarda en texto claro. Si el usuario olvida su password, el sistema envia un enlace temporal; al abrirlo, el usuario escribe una nueva password y el backend guarda un nuevo hash.

## Estructura

```text
database.sql
package.json
SUPABASE_PASOS.md
RECUPERACION_PASSWORD.md
practica-login-criptografia.code-workspace
public/
  index.html
  verify.html
  reset-password.html
src/
  crypto/passwordHash.js
  db/supabase.js
  mail/mailer.js
  server.js
```
