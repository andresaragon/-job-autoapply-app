-- Migración para Perfiles de Candidato (Fase 3: Auto-Apply & n8n Integration)

-- 1. Tabla de perfiles de usuario para auto-completado de postulaciones
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

-- 2. Índices de rendimiento
create index if not exists idx_profiles_user_id on public.profiles(user_id);

-- 3. Row Level Security en profiles
alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'usuarios ven su propio perfil' and tablename = 'profiles'
  ) then
    create policy "usuarios ven su propio perfil"
      on public.profiles for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'usuarios crean su propio perfil' and tablename = 'profiles'
  ) then
    create policy "usuarios crean su propio perfil"
      on public.profiles for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'usuarios actualizan su propio perfil' and tablename = 'profiles'
  ) then
    create policy "usuarios actualizan su propio perfil"
      on public.profiles for update
      using (auth.uid() = user_id);
  end if;
end $$;

-- 4. Extender trigger de nuevo usuario para inicializar también el perfil
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
