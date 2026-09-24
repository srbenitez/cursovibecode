-- Catálogo: categorías ISO 37120 y subcategorías de ciencia ciudadana.
-- Fuente: «Categorías ISO 37120 para consultar a la comunidad» (PDF).
-- PENDIENTE DE CONFIRMAR: la asignación subcategoría → categoría se dedujo por
-- sentido, porque el PDF perdió la alineación de columnas al extraer el texto.
-- Para corregirla, edite este archivo ANTES del primer `supabase db push`,
-- o después cree una migración nueva con los UPDATE necesarios.

with datos (categoria, subcategoria) as (
  values
    ('Agua y saneamiento', 'Zonas sin saneamiento/alcantarillado'),
    ('Agua y saneamiento', 'Falta de agua potable'),
    ('Agua y saneamiento', 'Fugas de agua/Desperdicio'),

    ('Medio ambiente', 'Mala calidad del aire'),
    ('Medio ambiente', 'Problemas respiratorios/Contaminación aérea'),
    ('Medio ambiente', 'Escasez/Deterioro de espacios verdes'),
    ('Medio ambiente', 'Niveles altos de ruido'),

    ('Seguridad', 'Zonas peligrosas'),
    ('Seguridad', 'Iluminación deficiente/Calles oscuras'),
    ('Seguridad', 'Delitos violentos'),
    ('Seguridad', 'Robos frecuentes'),
    ('Seguridad', 'Ausencia de vigilancia policial'),
    ('Seguridad', 'Inseguridad nocturna'),

    ('Transporte', 'Falta de transporte/Cobertura deficiente'),
    ('Transporte', 'Vías peligrosas'),
    ('Transporte', 'Transporte público poco accesible'),
    ('Transporte', 'Falta de ciclovías'),

    ('Vivienda', 'Vivienda deficiente o hacinamiento'),
    ('Vivienda', 'Asentamientos informales'),
    ('Vivienda', 'Falta de servicios básicos en el hogar'),

    ('Educación', 'Deserción escolar'),
    ('Educación', 'Baja calidad educativa'),
    ('Educación', 'Desigualdad en el acceso a la tecnología'),
    ('Educación', 'Déficit de docentes'),

    ('Salud', 'Falta de acceso a centros de salud'),
    ('Salud', 'Infraestructura sanitaria insuficiente'),
    ('Salud', 'Mala calidad de la atención'),

    ('Residuos sólidos', 'Acumulación de basura'),
    ('Residuos sólidos', 'Vertederos ilegales'),
    ('Residuos sólidos', 'Falta de reciclaje'),
    ('Residuos sólidos', 'Residuos peligrosos'),

    ('Energía / Electricidad', 'Cortes de luz frecuentes/Servicio inestable'),
    ('Energía / Electricidad', 'Escasa generación de energía renovable'),

    ('Telecomunicaciones', 'Falta de internet o conectividad deficiente'),
    ('Telecomunicaciones', 'Mala señal de celular'),

    ('Recreación', 'Escasez/Deterioro de espacios verdes'),
    ('Recreación', 'Parques deteriorados'),

    ('Cultura y deporte', 'Falta de eventos culturales'),
    ('Cultura y deporte', 'Uso limitado de espacios públicos'),

    ('Agricultura urbana', 'Riesgo de desabastecimiento de alimentos'),
    ('Agricultura urbana', 'Falta de agricultura urbana'),

    ('Aguas residuales', 'Contaminación por aguas servidas'),
    ('Aguas residuales', 'Falta de alcantarillado'),

    ('Economía', 'Altos niveles de desempleo'),
    ('Economía', 'Informalidad laboral'),
    ('Economía', 'Escasez de emprendimientos'),

    ('Finanzas', 'Falta de transparencia'),
    ('Finanzas', 'Baja inversión pública'),

    ('Gobernanza', 'Desconfianza institucional'),
    ('Gobernanza', 'Baja participación ciudadana'),
    ('Gobernanza', 'Percepción de falta de transparencia'),

    ('Población y condiciones sociales', 'Pobreza/Vulnerabilidad social'),
    ('Población y condiciones sociales', 'Desigualdad económica'),
    ('Población y condiciones sociales', 'Falta de servicios básicos'),
    ('Población y condiciones sociales', 'Asentamientos irregulares'),

    ('Planificación urbana', 'Escasez de espacios públicos'),
    ('Planificación urbana', 'Mala planificación urbana'),

    ('Clima y desastres', 'Alta vulnerabilidad a desastres climáticos'),

    ('Patrimonio cultural', 'Deterioro del patrimonio histórico/cultural')
),
cats as (
  insert into categoria (nombre)
  select distinct categoria from datos
  returning id, nombre
)
insert into subcategoria (categoria_id, nombre)
select cats.id, datos.subcategoria
from datos join cats on cats.nombre = datos.categoria;
