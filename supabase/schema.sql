-- Esquema inicial para la app de auto-aplicación a empleos.
-- Ejecuta esto en el SQL Editor de tu proyecto de Supabase (supabase.com/dashboard).
-- Usa auth.users (ya provisto por Supabase) como la tabla de usuarios; el resto
-- referencia auth.users.id, así que no hace falta crear una tabla de usuarios propia.

create extension if not exists "uuid-ossp";

-- Nivel de suscripción y créditos del usuario. Una fila por usuario.
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  creditos_disponibles integer not null default 5 check (creditos_disponibles >= 0),
  fecha_renovacion date,
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- Perfil del candidato para auto-completado de aplicaciones.
create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  nombre_completo text,
  telefono text,
  linkedin_url text,
  github_url text,
  portafolio_url text,
  ubicacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Versiones del CV base que sube el usuario.
create table if not exists public.resumes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contenido_base text not null,
  es_actual boolean not null default true,
  created_at timestamptz not null default now()
);

-- Vacantes agregadas desde las distintas fuentes (Adzuna, Arbeitnow, Remotive,
-- feeds de Greenhouse/Lever/Ashby, etc.). Compartida entre todos los usuarios.
create table if not exists public.job_postings (
  id uuid primary key default uuid_generate_v4(),
  fuente text not null,
  titulo text not null,
  empresa text not null,
  url text not null,
  tipo_ats text, -- 'greenhouse' | 'lever' | 'ashby' | 'workday' | null
  remoto boolean not null default false,
  ubicacion text,
  descripcion text,
  fecha_publicacion timestamptz,
  created_at timestamptz not null default now(),
  unique (fuente, url)
);

-- Aplicaciones de un usuario a una vacante concreta.
create table if not exists public.applications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_posting_id uuid not null references public.job_postings(id) on delete cascade,
  resume_id uuid references public.resumes(id) on delete set null,
  cv_generado text,
  carta_generada text,
  estado text not null default 'borrador'
    check (estado in ('borrador','lista_para_revision','enviada','en_proceso','entrevista','rechazada','oferta')),
  modo text not null default 'manual' check (modo in ('auto_ats','semiauto','manual')),
  fecha_envio timestamptz,
  created_at timestamptz not null default now()
);

-- Auditoría y control de costo de cada llamada a la API de generación (Claude / Gemini).
create table if not exists public.ai_generations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null, -- 'cv' | 'carta' | 'entrevista'
  proveedor text not null default 'anthropic', -- 'anthropic' | 'gemini'
  tokens_entrada integer,
  tokens_salida integer,
  created_at timestamptz not null default now()
);

-- Índices para optimizar consultas y políticas de RLS basadas en auth.uid()
create index if not exists idx_resumes_user_id on public.resumes(user_id);
create index if not exists idx_profiles_user_id on public.profiles(user_id);
create index if not exists idx_applications_user_id on public.applications(user_id);
create index if not exists idx_applications_job_posting_id on public.applications(job_posting_id);
create index if not exists idx_ai_generations_user_id on public.ai_generations(user_id);
create index if not exists idx_job_postings_fecha on public.job_postings(fecha_publicacion desc);
create index if not exists idx_job_postings_remoto on public.job_postings(remoto);
create index if not exists idx_job_postings_fuente on public.job_postings(fuente);

-- Row Level Security: cada usuario solo ve y modifica sus propias filas.
-- job_postings es de lectura pública porque es el catálogo compartido de vacantes.

alter table public.subscriptions enable row level security;
alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.job_postings enable row level security;
alter table public.applications enable row level security;
alter table public.ai_generations enable row level security;

create policy "usuarios ven su propia suscripcion"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "usuarios ven su propio perfil"
  on public.profiles for select
  using (auth.uid() = user_id);
create policy "usuarios crean su propio perfil"
  on public.profiles for insert
  with check (auth.uid() = user_id);
create policy "usuarios actualizan su propio perfil"
  on public.profiles for update
  using (auth.uid() = user_id);

-- Crea automáticamente la fila de suscripción y perfil al registrarse un usuario nuevo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.subscriptions (user_id) values (new.id)
    on conflict (user_id) do nothing;
  insert into public.profiles (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create policy "usuarios ven sus propios cv"
  on public.resumes for select
  using (auth.uid() = user_id);
create policy "usuarios crean sus propios cv"
  on public.resumes for insert
  with check (auth.uid() = user_id);
create policy "usuarios actualizan sus propios cv"
  on public.resumes for update
  using (auth.uid() = user_id);
create policy "usuarios eliminan sus propios cv"
  on public.resumes for delete
  using (auth.uid() = user_id);

create policy "cualquiera autenticado lee vacantes"
  on public.job_postings for select
  to authenticated
  using (true);

create policy "usuarios ven sus propias aplicaciones"
  on public.applications for select
  using (auth.uid() = user_id);
create policy "usuarios crean sus propias aplicaciones"
  on public.applications for insert
  with check (auth.uid() = user_id);
create policy "usuarios actualizan sus propias aplicaciones"
  on public.applications for update
  using (auth.uid() = user_id);
create policy "usuarios eliminan sus propias aplicaciones"
  on public.applications for delete
  using (auth.uid() = user_id);

create policy "usuarios ven su propio historial de generaciones"
  on public.ai_generations for select
  using (auth.uid() = user_id);
create policy "usuarios registran sus propias generaciones"
  on public.ai_generations for insert
  with check (auth.uid() = user_id);

-- Reserva y reembolso atómicos de créditos (anti-TOCTOU).
-- La app NO debe leer el saldo y luego escribirlo: dos solicitudes simultáneas verían el mismo
-- saldo. Aquí el descuento es un único UPDATE condicional y el reembolso es relativo (+1).

-- Descuenta 1 crédito si hay saldo. Devuelve el nuevo saldo, o NULL si no hay saldo / suscripción.
create or replace function public.reserve_credit(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.subscriptions
     set creditos_disponibles = creditos_disponibles - 1
   where user_id = p_user_id
     and creditos_disponibles > 0
  returning creditos_disponibles;
$$;

-- Devuelve 1 crédito (reembolso tras un fallo). Devuelve el nuevo saldo, o NULL si no hay suscripción.
create or replace function public.refund_credit(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.subscriptions
     set creditos_disponibles = creditos_disponibles + 1
   where user_id = p_user_id
  returning creditos_disponibles;
$$;

-- Solo el backend (service_role) puede mover créditos; un usuario con su JWT no debe poder
-- regalarse saldo llamando a la RPC desde el navegador.
revoke all on function public.reserve_credit(uuid) from public, anon, authenticated;
revoke all on function public.refund_credit(uuid) from public, anon, authenticated;
grant execute on function public.reserve_credit(uuid) to service_role;
grant execute on function public.refund_credit(uuid) to service_role;
