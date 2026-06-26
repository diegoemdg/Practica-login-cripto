create extension if not exists "pgcrypto";
create extension if not exists "citext";

create table if not exists public.app_users (
  user_id text primary key,
  email citext not null unique,
  password_hash text not null,
  email_verified_at timestamptz,
  privacy_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users(user_id) on delete cascade,
  code_hash text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users(user_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users(user_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

create index if not exists email_verifications_user_id_idx on public.email_verifications(user_id);
create index if not exists email_verifications_expires_at_idx on public.email_verifications(expires_at);
create index if not exists password_resets_user_id_idx on public.password_resets(user_id);
create index if not exists password_resets_expires_at_idx on public.password_resets(expires_at);
create index if not exists auth_sessions_user_id_idx on public.auth_sessions(user_id);

alter table public.app_users enable row level security;
alter table public.email_verifications enable row level security;
alter table public.password_resets enable row level security;
alter table public.auth_sessions enable row level security;

-- Esta practica usa un backend propio con SUPABASE_SERVICE_ROLE_KEY.
-- No creamos politicas publicas: el navegador nunca debe tocar estas tablas directo.
