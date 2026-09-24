# Paso a paso: poner en marcha el clasificador ISO 37120 (todo desde el navegador)

**No necesita consola ni instalar nada.** Todo se hace en tres sitios web: la consola de Anthropic, el panel de Supabase y GitHub.
**Tiempo estimado:** 30 a 45 minutos. **Costo:** Supabase y GitHub Pages, gratis. Claude, alrededor de US$ 0,01 a 0,02 por imagen (estimado).

> **Regla de oro:** la **API key de Anthropic** (`sk-ant-…`) no se pega en ningún chat, correo ni archivo del repositorio. Solo va en el Paso 6.

| # | Paso | Dónde |
|---|---|---|
| 1 | Crear el proyecto | Supabase |
| 2 | Crear tablas y catálogo (SQL) | Supabase → SQL Editor |
| 3 | Verificar la base de datos | Supabase → SQL Editor |
| 4 | Crear la API key | Anthropic |
| 5 | Crear y desplegar la función | Supabase → Edge Functions |
| 6 | Guardar la API key como secreto | Supabase → Edge Functions → Secrets |
| 7 | Crear su usuario | Supabase → Authentication |
| 8 | Cerrar el registro público | Supabase → Authentication |
| 9 | Copiar la URL y la clave pública | Supabase → Project Settings |
| 10 | Pegarlas en la página | GitHub |
| 11 | Publicar la página | GitHub → Settings → Pages |
| 12 | Probar | Su página |
| 13 | Ver el costo real | Supabase → SQL Editor |

---

## Paso 1 · Crear el proyecto en Supabase
1. Entre a **https://supabase.com** → **Start your project** → ingrese con su cuenta de GitHub.
2. **New project**. Nombre: `clasificador-iso37120`. Presione **Generate a password** y guárdela. Región: **East US (North Virginia)**.
3. **Create new project** y espere unos 2 minutos.

## Paso 2 · Crear las tablas y el catálogo
1. Abra en GitHub `supabase/migrations/20260924000002_catalogo.sql` y **revise que cada subcategoría esté en la categoría correcta**. Si algo está mal, corríjalo antes de ejecutarlo.
2. Panel → **SQL Editor** → **New query**. Pegue **todo** el contenido de `20260924000001_esquema.sql` → **Run**. Debe decir *Success. No rows returned*.
3. **New query** otra vez. Pegue **todo** `20260924000002_catalogo.sql` → **Run**.

> Si ya lo hizo, pase al Paso 3.

## Paso 3 · Verificar la base de datos
En **SQL Editor → New query**, pegue y ejecute (**Run**):
```sql
select
  (select count(*) from categoria)    as categorias,
  (select count(*) from subcategoria) as subcategorias,
  (select count(*) from storage.buckets where id = 'imagenes' and not public) as bucket_privado;
```
**Resultado esperado:** `categorias = 21`, `subcategorias = 59`, `bucket_privado = 1`.

- `0` en categorías o subcategorías: el segundo archivo no se ejecutó. Repita el Paso 2.3.
- Error `relation "categoria" does not exist`: el primer archivo no se ejecutó. Repita el Paso 2.2.
- `bucket_privado = 0`: vuelva a ejecutar el primer archivo o avíseme.

## Paso 4 · Crear la API key de Anthropic
1. **https://console.anthropic.com** → cree la cuenta o ingrese.
2. **Settings → Billing → Add credits**: cargue el mínimo (unos US$ 5).
3. *(Recomendado)* **Settings → Limits**: ponga un límite mensual, por ejemplo US$ 10.
4. **Settings → API Keys → Create Key**, con el nombre `clasificador-iso37120`.
5. **Copie la clave en ese momento** (empieza con `sk-ant-`), porque no se vuelve a mostrar. La usará en el Paso 6.

## Paso 5 · Crear y desplegar la función (sin consola)
1. En GitHub, abra el archivo
   **`supabase/functions/analizar-imagen/index.ts`**
   (rama `claude/affectionate-pasteur-gmcv7u`).
2. Presione el botón **Copy raw file**, el ícono de dos hojas arriba a la derecha del código. Así copia el archivo completo.
3. En Supabase: panel → **Edge Functions** → **Deploy a new function** → **Via Editor**.
4. Se abre un editor con un código de ejemplo en `index.ts`:
   - Seleccione **todo** el código de ejemplo (Ctrl + A, o Cmd + A en Mac) y **bórrelo**.
   - **Pegue** el código que copió (Ctrl + V, o Cmd + V).
5. Abajo, en el campo del nombre de la función, escriba exactamente: **`analizar-imagen`**.
   ⚠ El nombre debe ser ese, con guion, porque la página web llama a la función por ese nombre.
6. Presione **Deploy function** y espere de 10 a 30 segundos.
7. **Verifique:** en **Edge Functions** debe aparecer `analizar-imagen`. Al entrar, en *Details* o *Settings*, **«Enforce JWT verification» (Verify JWT) debe estar activado**; viene activado por defecto.

> Si el despliegue da error, copie el mensaje exacto y compártalo aquí.

## Paso 6 · Guardar la API key como secreto
1. Panel → **Edge Functions** → **Secrets**.
2. **Add new secret**:
   - **Name:** `ANTHROPIC_API_KEY` (exactamente así)
   - **Value:** la clave `sk-ant-…` del Paso 4
3. **Save**. No hace falta volver a desplegar la función.

## Paso 7 · Crear su usuario
1. Panel → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Escriba su correo y una contraseña, y **marque «Auto Confirm User»**.
3. **Create user**.

## Paso 8 · Cerrar el registro público (no lo omita)
La clave pública queda visible en la página. Sin este paso, cualquiera podría crear una cuenta y gastar su crédito de Anthropic.
1. Panel → **Authentication** → **Sign In / Providers** (o **Settings**).
2. Desactive **«Allow new users to sign up»** → **Save**.

## Paso 9 · Copiar la URL y la clave pública
Panel → **Project Settings** (engranaje):
- **Data API** (o **API**) → **Project URL**, por ejemplo `https://abcdefghijklmnop.supabase.co`.
- **API Keys** → la clave **`anon` `public`** (empieza con `eyJ…`) o la **publishable** (empieza con `sb_publishable_…`).

⚠ **No use** la clave `service_role` ni la `sb_secret_…`.

## Paso 10 · Pegarlas en la página (en GitHub)
1. **https://github.com/srbenitez/cursovibecode** → selector de rama → **`claude/affectionate-pasteur-gmcv7u`**.
2. Abra `docs/js/config.js` → presione el **lápiz** (Edit this file).
3. Reemplace los dos valores, dejando las comillas:
   ```js
   export const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbGciOi…";
   ```
4. **Commit changes…** → **Commit changes**.

## Paso 11 · Publicar la página
1. En el repositorio: **Settings → Pages**.
2. **Source:** *Deploy from a branch*. **Branch:** `claude/affectionate-pasteur-gmcv7u`. **Carpeta:** **`/docs`**. Presione **Save**.
3. Espere de 1 a 3 minutos y recargue. Arriba aparecerá: **«Your site is live at https://srbenitez.github.io/cursovibecode/»**.

> Si Pages dice que requiere un plan de pago, el repositorio es **privado**. Hágalo público en *Settings → General → Change visibility* (el código no contiene claves) o use GitHub Pro.

## Paso 12 · Probar
1. Abra `https://srbenitez.github.io/cursovibecode/` e ingrese con el usuario del Paso 7.
2. Elija **Residuos sólidos → Acumulación de basura**, suba una foto de basura → **Enviar y analizar**. Tarda de 5 a 20 segundos.
3. Marque el resultado con **✓ Correcto** o **✗ Incorrecto**.
4. Siga con las pruebas de la tabla del `README.md`.

## Paso 13 · Ver el costo real
**SQL Editor → New query**:
```sql
select count(*) as imagenes,
       round(avg(tokens_entrada)) as tokens_entrada_prom,
       round(avg(tokens_salida))  as tokens_salida_prom,
       round((sum(tokens_entrada) * 2 + sum(tokens_salida) * 10) / 1e6, 4) as usd_total_estimado
from analisis
where estado = 'ok' and modelo_servido like 'claude-sonnet-5%';
```
También puede verlo en console.anthropic.com → **Usage**.

---

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La página queda en «Cargando…» o no muestra categorías | `config.js` mal copiado | Paso 10: revise que no falten comillas ni sobren espacios |
| «Invalid login credentials» | Usuario sin confirmar o contraseña distinta | Paso 7: bórrelo y créelo de nuevo con **Auto Confirm User** |
| «Failed to send a request to the Edge Function» | La función no existe o tiene otro nombre | Paso 5: el nombre debe ser `analizar-imagen` |
| «Sesión no válida» | Sesión expirada | **Salir** y volver a ingresar |
| «API de Claude (401)…» | Secreto mal escrito | Paso 6: nombre `ANTHROPIC_API_KEY` exacto y clave completa |
| «API de Claude (400)… credit balance» | Sin crédito | Paso 4: cargue crédito |
| «Límite de uso de la API» | Muchas imágenes seguidas | Espere un minuto → **Reintentar** |
| La foto del iPhone no sube (HEIC) | El navegador no lee HEIC | iPhone: *Ajustes → Cámara → Formatos → Más compatible* |
| GitHub Pages da 404 | Carpeta equivocada o aún publicando | Paso 11: carpeta `/docs`; espere 3 minutos |

Si algo no se resuelve, copie el mensaje de error exacto (sin claves) y compártalo en esta conversación. Para ver los errores internos de la función: panel → **Edge Functions** → `analizar-imagen` → **Logs**.
