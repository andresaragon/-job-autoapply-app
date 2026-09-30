-- Migración para el Módulo de Agregador de Vacantes y Gestión de Aplicaciones (2026-09-29)

-- 1. Política RLS para eliminación de aplicaciones propias
do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'usuarios eliminan sus propias aplicaciones' and tablename = 'applications'
  ) then
    create policy "usuarios eliminan sus propias aplicaciones"
      on public.applications for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- 2. Seguridad del catálogo global: job_postings solo debe modificarse mediante el servidor/service_role
-- Eliminamos cualquier política abierta de escritura para usuarios estándar para evitar falsificación del catálogo.
drop policy if exists "usuarios autenticados insertan vacantes" on public.job_postings;
drop policy if exists "usuarios autenticados actualizan vacantes" on public.job_postings;

-- 3. Índices adicionales para búsqueda eficiente en job_postings
create index if not exists idx_job_postings_remoto on public.job_postings(remoto);
create index if not exists idx_job_postings_fuente on public.job_postings(fuente);
