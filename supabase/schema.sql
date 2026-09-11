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
  creditos_disponibles integer not null default 5,
  fecha_renovacion date,
  created_at timestamptz not null default now(),
  unique (user_id)
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

-- Auditoría y control de costo de cada llamada a la API de generación (Claude).
create table if not exists public.ai_generations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null, -- 'cv' | 'carta' | 'entrevista'
  tokens_entrada integer,
  tokens_salida integer,
  created_at timestamptz not null default now()
);

-- Row Level Security: cada usuario solo ve y modifica sus propias filas.
-- job_postings es de lectura pública porque es el catálogo compartido de vacantes.

alter table public.subscriptions enable row level security;
alter table public.resumes enable row level security;
alter table public.job_postings enable row level security;
alter table public.applications enable row level security;
alter table public.ai_generations enable row level security;

create policy "usuarios ven su propia suscripcion"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Crea automáticamente la fila de suscripción (plan free, 5 créditos) al registrarse
-- un usuario nuevo. No hace falta policy de insert/update para el usuario: esta fila
-- se crea con SECURITY DEFINER y se actualiza desde el servidor con la service role key.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.subscriptions (user_id) values (new.id);
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

create policy "usuarios ven su propio historial de generaciones"
  on public.ai_generations for select
  using (auth.uid() = user_id);
create policy "usuarios registran sus propias generaciones"
  on public.ai_generations for insert
  with check (auth.uid() = user_id);
