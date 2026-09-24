# Clasificador de imágenes de problemas comunitarios (ISO 37120)

Prototipo de la **Guía 02 · Nivel 3** del curso Vibe Coding CEDIA 2026. Usted elige categoría y subcategoría y sube una imagen. Claude con visión devuelve si la imagen está **relacionada** (`si` / `no` / `no_determinable`), la **observabilidad**, una **descripción** de lo visible, el **motivo** y la **confianza**. Después usted marca cada resultado como **✓ correcto** o **✗ incorrecto**.

```
docs/                          página web (GitHub Pages)
  index.html                   analizar una imagen
  revision.html                historial y revisión (pendientes primero)
  js/config.js                 URL y clave pública de Supabase  ← editar
supabase/
  migrations/                  esquema, seguridad (RLS), bucket y catálogo ISO 37120
  functions/analizar-imagen/   Edge Function que llama a Claude
    metodo.ts                  prompt + esquema + modelo = versión del método
metodo/regla_clasificacion.md  la regla explicada, con registro de cambios
```

## Puesta en marcha (una sola vez, desde su computador)

Necesita Node.js 18 o superior. Los comandos usan `npx supabase`, así que no hace falta instalar el CLI.

**1 · Crear el proyecto en Supabase.** En [supabase.com](https://supabase.com), cree un proyecto nuevo. Anote el *Project ref*: es la parte `xxxx` de `https://xxxx.supabase.co`.

**2 · Clonar el repositorio y vincularlo**
```bash
git clone https://github.com/srbenitez/cursovibecode.git
cd cursovibecode
git checkout claude/affectionate-pasteur-gmcv7u
npx supabase init          # crea supabase/config.toml; responda «N» a las preguntas
npx supabase login         # abre el navegador
npx supabase link --project-ref SU_PROJECT_REF
```

> **Antes del paso 3:** revise la asignación subcategoría → categoría en `supabase/migrations/20260924000002_catalogo.sql`. Se dedujo del PDF y está pendiente de confirmar.

**3 · Crear las tablas, el bucket y el catálogo**
```bash
npx supabase db push
```

**4 · Guardar la API key de Anthropic como secreto** (nunca en el repositorio)
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```
También puede hacerlo en el panel: *Edge Functions → Secrets*.

**5 · Desplegar la función**
```bash
npx supabase functions deploy analizar-imagen
```

**6 · Crear su usuario y cerrar el registro público.** En el panel de Supabase:
- *Authentication → Users → Add user*: su correo y una contraseña, con **Auto Confirm User** marcado.
- *Authentication → Sign In / Providers*: **desactive «Allow new users to sign up»**. Es importante, porque la clave pública está en la página web y cualquiera podría registrarse.

**7 · Conectar la página.** En *Project Settings → API* copie la **URL** y la clave **anon** (o *publishable*) en `docs/js/config.js`. Después haga commit y push.

**8 · Publicar en GitHub Pages.** En GitHub: *Settings → Pages → Deploy from a branch*, rama `claude/affectionate-pasteur-gmcv7u` (o `main`, cuando la fusione), carpeta **`/docs`**. En unos minutos queda en `https://srbenitez.github.io/cursovibecode/`.

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
Con `claude-opus-5`, cada imagen cuesta unos **US$ 0,03 a 0,05**: unos 3.500 tokens de entrada y entre 500 y 1.500 de salida. Es una estimación: los tokens reales de cada análisis quedan en la tabla `analisis`. Para reducir el costo, cambie `MODELO` en `metodo.ts` a `claude-sonnet-5` (unas 2,5 veces más barato) y suba la versión del método.

## Seguridad
- La API key de Anthropic existe solo como secreto de la Edge Function.
- Todas las tablas tienen RLS. Sin sesión iniciada no se lee ni se escribe nada, y el navegador no puede escribir análisis: solo lo hace la función.
- El bucket `imagenes` es privado. La página muestra las fotos con URL firmadas que vencen en una hora.
- El navegador reduce la imagen a 1568 px y la vuelve a codificar, lo que elimina los metadatos EXIF, incluida la ubicación GPS.
