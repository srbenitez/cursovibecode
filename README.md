# Ciencia Ciudadana UTPL · ISO 37120

Sitio del proyecto *Monitoreo inteligente para comunidades sostenibles* (Guía 02 del curso Vibe Coding CEDIA 2026, niveles 3 y 4).

| Página | Para quién | Qué hace |
|---|---|---|
| **Reportar** (`index.html`) | Ciudadanía, sin cuenta | Formulario en dos partes: (1) privacidad y mayoría de edad; (2) el formulario, con mapa para marcar el lugar. Al enviar, la IA revisa la foto y le muestra a la persona si corresponde al problema, con una descripción sugerida. Se guarda en Supabase. |
| **Validar imagen** (`validar.html`) | Equipo investigador | Analiza una imagen contra una subcategoría y permite marcar ✓/✗. |
| **Historial** (`historial.html`) | Administradores | Pestañas: **Imágenes enviadas** (validar lo que dijo la IA; botón **Validar con IA** si no alcanzó a revisarla), **Encuestas enviadas** (tabla, detalle con mapa y foto, estado, CSV) y **Análisis manuales**. |
| Proyecto, Investigadores, Contacto | Público | Información del proyecto. |

```
docs/                                  sitio web (GitHub Pages)
  js/config.js                         URL y clave pública de Supabase
supabase/
  migrations/                          1) esquema de validación y catálogo ISO 37120
  sql/02_formulario_reportes.sql       2) base del formulario ciudadano
  sql/03_validacion_imagenes_enviadas.sql  3) validación humana de las fotos enviadas
  functions/analizar-imagen/           función de «Validar imagen» (equipo)
  functions/sugerir-descripcion/       función del formulario (pública, con límites)
metodo/regla_clasificacion.md          la regla de clasificación explicada
```

## Puesta en marcha

Siga **[PASO_A_PASO.md](PASO_A_PASO.md)**, todo desde el navegador y sin consola. La **Parte A** pone en marcha «Validar imagen»; la **Parte B**, el formulario ciudadano.

## Probar
1. Ingrese con su correo y contraseña.
2. Elija, por ejemplo, *Aguas residuales → Falta de alcantarillado*, suba una foto y envíe.
3. Revise el resultado con ✓ o ✗. En *Historial y revisión* verá los pendientes, con los de confianza baja primero.

| Prueba | Resultado esperado |
|---|---|
| Foto de basura acumulada con *Residuos sólidos → Acumulación de basura* | `si`, `observable` |
| La misma foto con *Transporte → Falta de ciclovías* | `no` |
| Cualquier foto con *Seguridad → Delitos violentos* | `no_determinable`, `no_observable` |
| Foto muy oscura o borrosa | advertencia «Imagen ilegible», `no_determinable` |
| Subir dos veces la misma foto | no se duplica; se crea un análisis nuevo |
| Marcar ✗ sin cambiar ningún valor | la app pide cambiar al menos uno |

## Costo aproximado
El método usa `claude-sonnet-5` con esfuerzo `low` (US$ 2 por millón de tokens de entrada y US$ 10 por millón de salida). Calculo **alrededor de US$ 0,01 a 0,02 por imagen**: unas 100 imágenes por US$ 1 a 2. Es una estimación; el costo real de cada análisis se puede consultar con la consulta del paso 13 de PASO_A_PASO.md. Si la calidad no alcanza, cambie `MODELO` al inicio de `index.ts` a `claude-opus-5`, que cuesta unas 2,5 veces más, y suba la versión del método.

## Seguridad
- La API key de Anthropic existe solo como secreto de la Edge Function.
- Todas las tablas tienen RLS. Sin sesión iniciada no se lee ni se escribe nada, y el navegador no puede escribir análisis: solo lo hace la función.
- El bucket `imagenes` es privado. La página muestra las fotos con URL firmadas que vencen en una hora.
- El navegador reduce la imagen a 1568 px y la vuelve a codificar, lo que elimina los metadatos EXIF, incluida la ubicación GPS.
