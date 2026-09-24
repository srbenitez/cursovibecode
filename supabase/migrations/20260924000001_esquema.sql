-- Guía 02 · Nivel 3 · Clasificación de imágenes de problemas comunitarios (ISO 37120)
-- Tablas, tipos, seguridad (RLS) y bucket privado de imágenes.

-- ── Tipos ───────────────────────────────────────────────────────────────
create type relacion as enum ('si', 'no', 'no_determinable');
create type observabilidad as enum ('observable', 'indicio', 'no_observable');
create type confianza as enum ('alta', 'media', 'baja');
create type estado_analisis as enum ('ok', 'error', 'rechazo');

-- ── Catálogo ────────────────────────────────────────────────────────────
create table categoria (
  id     smallint generated always as identity primary key,
  nombre text not null unique
);

create table subcategoria (
  id           smallint generated always as identity primary key,
  categoria_id smallint not null references categoria (id),
  nombre       text not null,
  unique (categoria_id, nombre)
);

-- ── Versión del método: prompt + esquema + modelo ───────────────────────
create table metodo_version (
  id        text primary key,               -- p. ej. 'v1.0'
  modelo    text not null,
  prompt    text not null,
  esquema   jsonb not null,
  creado_en timestamptz not null default now()
);

-- ── Imágenes ────────────────────────────────────────────────────────────
create sequence imagen_codigo_seq;

create table imagen (
  id           uuid primary key,
  codigo       text not null unique
               default 'IMG-' || lpad(nextval('imagen_codigo_seq')::text, 4, '0'),
  storage_path text not null unique,
  sha256       text not null unique,        -- evita subir dos veces la misma foto
  ancho        int not null,
  alto         int not null,
  nombre_original text,
  subido_por   uuid not null default auth.uid() references auth.users (id),
  subido_en    timestamptz not null default now()
);

-- ── Análisis del modelo (solo lo escribe la Edge Function) ──────────────
create table analisis (
  id              bigint generated always as identity primary key,
  imagen_id       uuid not null references imagen (id) on delete cascade,
  subcategoria_id smallint not null references subcategoria (id),
  metodo_version  text not null references metodo_version (id),
  modelo_servido  text,                     -- modelo que respondió realmente
  estado          estado_analisis not null,
  descripcion     text,
  ilegible        boolean,
  observabilidad  observabilidad,
  relacionada     relacion,
  motivo          text,
  confianza       confianza,
  condiciones     text[] not null default '{}',
  respuesta_cruda jsonb,
  error           text,
  tokens_entrada  int,
  tokens_salida   int,
  creado_por      uuid references auth.users (id),
  creado_en       timestamptz not null default now()
);
create index on analisis (imagen_id);

-- ── Revisión humana: ✓ correcto / ✗ incorrecto con valor corregido ──────
create table revision (
  id                       bigint generated always as identity primary key,
  analisis_id              bigint not null references analisis (id) on delete cascade,
  correcto                 boolean not null,
  relacionada_corregida    relacion,
  observabilidad_corregida observabilidad,
  comentario               text,
  revisor                  uuid not null default auth.uid() references auth.users (id),
  revisor_email            text not null default (auth.jwt() ->> 'email'),
  revisado_en              timestamptz not null default now(),
  -- si marca «incorrecto», debe indicar al menos un valor corregido
  check (correcto or relacionada_corregida is not null or observabilidad_corregida is not null)
);
create index on revision (analisis_id, revisado_en desc);

-- ── Vista para las páginas: cada análisis con su última revisión ────────
create view v_resultados with (security_invoker = true) as
select
  a.id as analisis_id, a.creado_en, a.estado, a.error,
  a.metodo_version, a.modelo_servido,
  i.id as imagen_id, i.codigo, i.storage_path,
  a.subcategoria_id, c.nombre as categoria, s.nombre as subcategoria,
  a.descripcion, a.ilegible, a.observabilidad, a.relacionada,
  a.motivo, a.confianza, a.condiciones,
  r.correcto, r.relacionada_corregida, r.observabilidad_corregida,
  r.comentario, r.revisor_email, r.revisado_en,
  -- valor final: el corregido por la persona si existe, si no el del modelo
  coalesce(r.relacionada_corregida, a.relacionada)       as relacionada_final,
  coalesce(r.observabilidad_corregida, a.observabilidad) as observabilidad_final
from analisis a
join imagen i       on i.id = a.imagen_id
join subcategoria s on s.id = a.subcategoria_id
join categoria c    on c.id = s.categoria_id
left join lateral (
  select * from revision rv
  where rv.analisis_id = a.id
  order by rv.revisado_en desc
  limit 1
) r on true;

-- ── Seguridad: sin sesión iniciada no se lee ni se escribe nada ─────────
alter table categoria      enable row level security;
alter table subcategoria   enable row level security;
alter table metodo_version enable row level security;
alter table imagen         enable row level security;
alter table analisis       enable row level security;
alter table revision       enable row level security;

create policy "leer catálogo" on categoria      for select to authenticated using (true);
create policy "leer catálogo" on subcategoria   for select to authenticated using (true);
create policy "leer métodos"  on metodo_version for select to authenticated using (true);

create policy "leer imágenes"  on imagen for select to authenticated using (true);
create policy "subir imágenes" on imagen for insert to authenticated
  with check (subido_por = auth.uid());

-- analisis: solo lectura desde el navegador; lo inserta la función con service_role
create policy "leer análisis" on analisis for select to authenticated using (true);

create policy "leer revisiones"  on revision for select to authenticated using (true);
create policy "crear revisiones" on revision for insert to authenticated
  with check (revisor = auth.uid());

-- ── Storage: bucket privado, imágenes de hasta 5 MB ─────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagenes', 'imagenes', false, 5242880, array['image/jpeg']);

create policy "subir a imagenes" on storage.objects for insert to authenticated
  with check (bucket_id = 'imagenes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "ver imagenes" on storage.objects for select to authenticated
  using (bucket_id = 'imagenes');
