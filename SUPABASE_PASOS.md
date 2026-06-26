# Pasos para conectar el programa a Supabase

## 1. Crear el proyecto

1. Entra a https://supabase.com.
2. Crea un proyecto nuevo.
3. Espera a que Supabase termine de preparar la base de datos.

## 2. Crear las tablas

1. En Supabase abre **SQL Editor**.
2. Copia el contenido de `database.sql`.
3. Ejecutalo completo.

Ese archivo crea estas tablas:

- `app_users`: usuarios de la practica.
- `email_verifications`: codigos/enlaces temporales para verificar cuenta.
- `password_resets`: enlaces temporales para cambiar password.
- `auth_sessions`: sesiones generadas al iniciar sesion.

Tambien activa Row Level Security. Como este proyecto usa backend propio, el navegador no se conecta directo a las tablas.

## 3. Copiar las credenciales

En Supabase ve a **Project Settings > API** y copia:

- `Project URL`
- `service_role key`

La `service_role key` es delicada. Solo va en el archivo `.env` del servidor, nunca en HTML ni JavaScript del navegador.

## 4. Preparar `.env`

En VS Code copia `.env.example` y renombralo como `.env`.

En PowerShell puedes hacerlo asi:

```powershell
Copy-Item .env.example .env
```

Luego llena:

```env
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
PASSWORD_PEPPER=un-secreto-largo-y-aleatorio
```

## 5. Configurar correo

Para enviar correos necesitas SMTP. Puedes usar Mailtrap para pruebas, Gmail con app password, Outlook, SendGrid, Resend SMTP, etc.

Configura:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario@example.com
SMTP_PASS=password-del-smtp
MAIL_FROM="Practica Criptografia <no-reply@example.com>"
```

## 6. Instalar y ejecutar

Desde la terminal de VS Code:

```powershell
npm.cmd install
npm.cmd run test:hash
npm.cmd run dev
```

Luego abre:

```text
http://localhost:3000
```

## 7. Probar flujo completo

1. Crea una cuenta.
2. Revisa el correo recibido.
3. Verifica con el enlace o con el codigo.
4. Inicia sesion.
5. Usa "Restablecer password".
6. Abre el enlace recibido y escribe una nueva password.
7. Inicia sesion con la nueva password.

## Problemas comunes

- Si `npm` falla en PowerShell por politicas de ejecucion, usa `npm.cmd`.
- Si no llegan correos, revisa SMTP_HOST, SMTP_USER y SMTP_PASS.
- Si Supabase responde `Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY`, revisa el archivo `.env`.
- Si el login dice que falta verificar, entra al enlace de verificacion primero.
