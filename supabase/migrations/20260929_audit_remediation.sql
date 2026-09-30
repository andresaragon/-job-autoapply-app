-- Migración de remediación de auditoría (2026-09-29)
-- Aplica índices para optimizar RLS, validación de créditos, políticas de resumes y proveedor de IA.

-- 1. Restricción para impedir créditos negativos por condiciones de carrera
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_creditos_no_negativos'
  ) then
    alter table public.subscriptions
      add constraint chk_creditos_no_negativos check (creditos_disponibles >= 0);
  end if;
end $$;

-- 2. Columna para registrar el proveedor que resolvió la generación (Anthropic o Gemini)
alter table public.ai_generations
  add column if not exists proveedor text not null default 'anthropic';

-- 3. Índices en claves foráneas para acelerar RLS de auth.uid() = user_id
create index if not exists idx_resumes_user_id on public.resumes(user_id);
create index if not exists idx_applications_user_id on public.applications(user_id);
create index if not exists idx_applications_job_posting_id on public.applications(job_posting_id);
create index if not exists idx_ai_generations_user_id on public.ai_generations(user_id);
create index if not exists idx_job_postings_fecha on public.job_postings(fecha_publicacion desc);

-- 4. Políticas de actualización y eliminación para CVs del propio usuario
do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'usuarios actualizan sus propios cv' and tablename = 'resumes'
  ) then
    create policy "usuarios actualizan sus propios cv"
      on public.resumes for update
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'usuarios eliminan sus propios cv' and tablename = 'resumes'
  ) then
    create policy "usuarios eliminan sus propios cv"
      on public.resumes for delete
      using (auth.uid() = user_id);
  end if;
end $$;
