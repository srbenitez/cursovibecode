-- ═══════════════════════════════════════════════════════════════════════════
-- Validación de las imágenes enviadas en el formulario ciudadano
-- Ejecutar en Supabase → SQL Editor, DESPUÉS de 02_formulario_reportes.sql.
-- Se puede volver a ejecutar sin errores: no borra datos.
-- ═══════════════════════════════════════════════════════════════════════════

-- Cada validación humana de la imagen de un reporte. Una nueva no borra la anterior.
create table if not exists public.revision_reporte (
  id                    bigint generated always as identity primary key,
  reporte_id            uuid not null references public.reportes_ciudadanos (id) on delete cascade,
  -- ¿acertó la IA? true = sí; false = no (se indica el valor correcto);
  -- null = la IA no alcanzó a revisar y la persona decide directamente
  correcto              boolean,
  relacionada_corregida text check (relacionada_corregida in ('si', 'no', 'no_determinable')),
  comentario            text,
  revisor               uuid not null default auth.uid() references auth.users (id),
  revisor_email         text not null default (auth.jwt() ->> 'email'),
  revisado_en           timestamptz not null default now(),
  check (correcto is true or relacionada_corregida is not null)
);
create index if not exists revision_reporte_idx on public.revision_reporte (reporte_id, revisado_en desc);

alter table public.revision_reporte enable row level security;
revoke all on public.revision_reporte from anon, authenticated;
grant select, insert on public.revision_reporte to authenticated;

drop policy if exists "admin lee validaciones" on public.revision_reporte;
create policy "admin lee validaciones" on public.revision_reporte
  for select to authenticated using (public.es_admin());

drop policy if exists "admin valida imágenes" on public.revision_reporte;
create policy "admin valida imágenes" on public.revision_reporte
  for insert to authenticated with check (public.es_admin() and revisor = auth.uid());

-- La vista del panel suma la última validación de cada reporte (columnas al final).
create or replace view public.v_reportes with (security_invoker = true) as
select
  r.*,
  c.nombre  as categoria,
  s.nombre  as subcategoria,
  ia.relacionada   as ia_relacionada,
  ia.observabilidad as ia_observabilidad,
  ia.descripcion   as ia_descripcion,
  ia.motivo        as ia_motivo,
  ia.confianza     as ia_confianza,
  ia.datos_identificables as ia_datos_identificables,
  ia.modelo        as ia_modelo,
  rv.correcto              as imagen_ia_correcta,
  rv.relacionada_corregida as imagen_relacionada_corregida,
  rv.comentario            as imagen_comentario,
  rv.revisor_email         as imagen_revisor,
  rv.revisado_en           as imagen_revisada_en,
  coalesce(rv.relacionada_corregida, ia.relacionada) as imagen_relacionada_final
from public.reportes_ciudadanos r
join public.subcategoria s on s.id = r.subcategoria_id
join public.categoria c    on c.id = s.categoria_id
left join public.sugerencia_ia ia on ia.id = r.sugerencia_id
left join lateral (
  select * from public.revision_reporte x
  where x.reporte_id = r.id
  order by x.revisado_en desc
  limit 1
) rv on true;
grant select on public.v_reportes to authenticated;

-- Verificación: debe devolver 1 fila con validaciones = 0
select (select count(*) from public.revision_reporte) as validaciones;
