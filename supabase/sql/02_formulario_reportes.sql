-- ═══════════════════════════════════════════════════════════════════════════
-- Formulario ciudadano · base de datos
-- Ejecutar UNA vez en Supabase → SQL Editor, DESPUÉS de los dos archivos de
-- supabase/migrations/ (usa las tablas categoria y subcategoria).
-- Se puede volver a ejecutar sin errores: no borra datos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Administradores: quién puede ver los reportes ─────────────────────────
create table if not exists public.administradores (
  email text primary key check (email = lower(email))
);
alter table public.administradores enable row level security;
revoke all on public.administradores from anon, authenticated;

insert into public.administradores (email) values ('srbenitez@gmail.com')
on conflict do nothing;

create or replace function public.es_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.administradores
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.es_admin() from public;
grant execute on function public.es_admin() to anon, authenticated;

-- ── 2. El catálogo ISO 37120 se puede leer sin iniciar sesión (lo usa el formulario)
drop policy if exists "catálogo público" on public.categoria;
create policy "catálogo público" on public.categoria for select to anon using (true);
drop policy if exists "catálogo público" on public.subcategoria;
create policy "catálogo público" on public.subcategoria for select to anon using (true);
grant select on public.categoria, public.subcategoria to anon;

-- ── 3. Sugerencias de la IA sobre la imagen (las escribe solo la Edge Function)
create table if not exists public.sugerencia_ia (
  id              uuid primary key default gen_random_uuid(),
  creado_en       timestamptz not null default now(),
  ip_hash         text,                  -- huella anónima, solo para limitar abusos
  subcategoria_id smallint not null references public.subcategoria (id),
  relacionada     text check (relacionada in ('si', 'no', 'no_determinable')),
  observabilidad  text check (observabilidad in ('observable', 'indicio', 'no_observable')),
  descripcion     text,
  motivo          text,
  confianza       text check (confianza in ('alta', 'media', 'baja')),
  datos_identificables boolean,          -- rostros, placas, números de casa…
  modelo          text,
  metodo_version  text,
  tokens_entrada  int,
  tokens_salida   int,
  estado          text not null default 'ok' check (estado in ('ok', 'error', 'rechazo')),
  error           text
);
create index if not exists sugerencia_ia_creado_idx on public.sugerencia_ia (creado_en desc);
create index if not exists sugerencia_ia_ip_idx on public.sugerencia_ia (ip_hash, creado_en desc);
alter table public.sugerencia_ia enable row level security;
revoke all on public.sugerencia_ia from anon, authenticated;
grant select on public.sugerencia_ia to authenticated;
drop policy if exists "admin lee sugerencias" on public.sugerencia_ia;
create policy "admin lee sugerencias" on public.sugerencia_ia
  for select to authenticated using (public.es_admin());

-- ── 4. Reportes ciudadanos (lo que envía el formulario) ─────────────────────
create table if not exists public.reportes_ciudadanos (
  id                      uuid primary key default gen_random_uuid(),
  creado_en               timestamptz not null default now(),
  -- consentimiento
  consentimiento_aceptado boolean not null check (consentimiento_aceptado),
  consentimiento_version  text not null,
  mayor_edad_confirmado   boolean not null check (mayor_edad_confirmado),
  formulario_version      text not null,
  -- clasificación
  subcategoria_id         smallint not null references public.subcategoria (id),
  gravedad                smallint not null check (gravedad between 1 and 3),
  frecuencia              text not null check (frecuencia in ('Primera vez', 'Ocurre a veces', 'Es constante')),
  -- ubicación del problema
  latitud                 double precision not null check (latitud between -90 and 90),
  longitud                double precision not null check (longitud between -180 and 180),
  -- descripción y evidencia
  descripcion_problema    text check (descripcion_problema is null or length(descripcion_problema) <= 300),
  descripcion_origen      text check (descripcion_origen in ('persona', 'ia', 'ia_editada')),
  evidencia_ruta          text,
  evidencia_tamano        int check (evidencia_tamano is null or evidencia_tamano between 1 and 5242880),
  sugerencia_id           uuid references public.sugerencia_ia (id),
  -- contexto
  afecta_personalmente    boolean not null,
  descripcion_afectacion  text check (descripcion_afectacion is null or length(descripcion_afectacion) <= 160),
  rango_edad              text not null check (rango_edad in ('18–24', '25–34', '35–49', '50–64', '65+')),
  vinculo_territorio      text[] not null check (
    cardinality(vinculo_territorio) > 0
    and vinculo_territorio <@ array['Residente', 'Comerciante', 'Visitante', 'Estudiante', 'Otro']::text[]
  ),
  -- gestión del equipo investigador
  estado                  text not null default 'recibido'
                          check (estado in ('recibido', 'en_revision', 'validado', 'excluido')),
  nota_investigador       text,
  constraint afectacion_requiere_descripcion check (
    not afecta_personalmente or length(trim(coalesce(descripcion_afectacion, ''))) > 0
  ),
  constraint evidencia_coherente check ((evidencia_ruta is null) = (evidencia_tamano is null))
);
create index if not exists reportes_creado_idx on public.reportes_ciudadanos (creado_en desc);

alter table public.reportes_ciudadanos enable row level security;
revoke all on public.reportes_ciudadanos from anon, authenticated;
grant insert on public.reportes_ciudadanos to anon, authenticated;
grant select, update (estado, nota_investigador) on public.reportes_ciudadanos to authenticated;

-- cualquiera puede ENVIAR un reporte (no leerlo); el estado inicial es fijo
drop policy if exists "enviar reporte" on public.reportes_ciudadanos;
create policy "enviar reporte" on public.reportes_ciudadanos
  for insert to anon, authenticated
  with check (
    consentimiento_aceptado and mayor_edad_confirmado
    and formulario_version = '3.0.0'
    and estado = 'recibido' and nota_investigador is null
  );

drop policy if exists "admin lee reportes" on public.reportes_ciudadanos;
create policy "admin lee reportes" on public.reportes_ciudadanos
  for select to authenticated using (public.es_admin());

drop policy if exists "admin actualiza estado" on public.reportes_ciudadanos;
create policy "admin actualiza estado" on public.reportes_ciudadanos
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- ── 5. Vista para el panel de administración ───────────────────────────────
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
  ia.modelo        as ia_modelo
from public.reportes_ciudadanos r
join public.subcategoria s on s.id = r.subcategoria_id
join public.categoria c    on c.id = s.categoria_id
left join public.sugerencia_ia ia on ia.id = r.sugerencia_id;
grant select on public.v_reportes to authenticated;

-- ── 6. Imágenes de evidencia: bucket privado, solo JPEG hasta 5 MB ───────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reportes-evidencias', 'reportes-evidencias', false, 5242880, array['image/jpeg'])
on conflict (id) do update set
  public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "enviar evidencia" on storage.objects;
create policy "enviar evidencia" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'reportes-evidencias' and storage.extension(name) = 'jpg');

drop policy if exists "admin ve evidencias" on storage.objects;
create policy "admin ve evidencias" on storage.objects
  for select to authenticated
  using (bucket_id = 'reportes-evidencias' and public.es_admin());

-- Verificación: debe devolver 1 fila con reportes = 0 y bucket = 1
select
  (select count(*) from public.reportes_ciudadanos) as reportes,
  (select count(*) from storage.buckets where id = 'reportes-evidencias') as bucket,
  (select count(*) from public.administradores) as administradores;
