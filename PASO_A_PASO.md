# Paso a paso: poner en marcha el clasificador ISO 37120

**Tiempo estimado:** 45 a 60 minutos, la primera vez.
**Costo:** Supabase y GitHub Pages, gratis. Claude, alrededor de US$ 0,01 a 0,02 por imagen analizada (estimado). Anthropic pide una carga mínima de crédito (unos US$ 5).

Al terminar tendrá una página web propia donde ingresa con su correo, sube una foto, elige la categoría y recibe la clasificación para marcarla como correcta o incorrecta.

> **Regla de oro:** la **API key de Anthropic** (`sk-ant-…`) y la **contraseña de la base de datos** no se pegan en ningún chat, correo ni archivo del repositorio. Solo van donde esta guía lo indica.

---

## Parte 1 · Preparar su computador

### Paso 1 · Instalar Node.js
Node.js permite ejecutar el CLI de Supabase con `npx`, sin instalarlo aparte.

1. Entre a **https://nodejs.org** y descargue la versión **LTS** (el botón verde de la izquierda).
2. Ejecute el instalador y acepte todas las opciones por defecto.
3. Abra una terminal:
   - **Windows:** tecla Windows → escriba `PowerShell` → Enter.
   - **Mac:** Cmd + Espacio → escriba `Terminal` → Enter.
4. Escriba este comando y presione Enter:
   ```
   node -v
   ```
   Debe aparecer algo como `v22.11.0`. Si dice «no se reconoce», cierre la terminal, ábrala de nuevo y repita.

### Paso 2 · Instalar Git
1. **Windows:** descargue desde **https://git-scm.com/download/win** e instale con las opciones por defecto.
   **Mac:** en la terminal escriba `git --version`; si no está instalado, el sistema ofrecerá instalarlo. Acepte.
2. Verifique en la terminal:
   ```
   git --version
   ```
   Debe responder algo como `git version 2.46.0`.

---

## Parte 2 · La API key de Anthropic

### Paso 3 · Crear la cuenta, cargar crédito y crear la clave
1. Entre a **https://console.anthropic.com** y cree una cuenta, o ingrese si ya la tiene.
2. Menú **Settings → Billing** → **Add credits**. Cargue el mínimo (unos US$ 5). Con el modelo actual alcanza para varios cientos de imágenes.
3. *(Recomendado)* En **Settings → Limits**, ponga un **límite de gasto mensual**, por ejemplo US$ 10, para no llevarse sorpresas.
4. Menú **Settings → API Keys** → **Create Key**.
   - Nombre: `clasificador-iso37120`.
   - Presione **Add** o **Create**.
5. **Copie la clave en ese momento**, porque no se vuelve a mostrar. Empieza con `sk-ant-`.
   Guárdela temporalmente en un lugar seguro, como su gestor de contraseñas. La usará en el **Paso 12**.

---

## Parte 3 · El proyecto de Supabase

### Paso 4 · Crear el proyecto
1. Entre a **https://supabase.com** → **Start your project** → ingrese con su cuenta de GitHub.
2. Si le pide crear una **organización**, use su nombre o el de su grupo y el plan **Free**.
3. Presione **New project** y complete:
   - **Name:** `clasificador-iso37120`
   - **Database Password:** presione **Generate a password** y **guárdela** en su gestor de contraseñas. La necesitará en el Paso 9.
   - **Region:** **East US (North Virginia)**, la más cercana a Ecuador con buena conexión.
4. Presione **Create new project** y espere unos 2 minutos hasta que el panel deje de decir «Setting up project».

### Paso 5 · Anotar tres datos del proyecto
En el panel del proyecto, entre a **Project Settings** (el engranaje abajo a la izquierda):

| Dato | Dónde está | Ejemplo | ¿Es secreto? |
|---|---|---|---|
| **Project ref** (o *Project ID*) | *General* | `abcdefghijklmnop` | No |
| **Project URL** | *Data API* (o *API*) | `https://abcdefghijklmnop.supabase.co` | No |
| **Clave anon / publishable** | *API Keys*: la que dice `anon` `public` o empieza con `sb_publishable_` | `eyJhbGciOi…` o `sb_publishable_…` | No; está hecha para la página web |

⚠ **No copie** la clave `service_role` ni la que empieza con `sb_secret_`. Esas no se usan en ningún paso.

---

## Parte 4 · Descargar el código y crear la base de datos

### Paso 6 · Descargar el repositorio
En la terminal, escriba uno por uno (Enter después de cada línea):
```
cd Documents
git clone https://github.com/srbenitez/cursovibecode.git
cd cursovibecode
git checkout claude/affectionate-pasteur-gmcv7u
```
El último comando debe decir `Switched to a new branch 'claude/affectionate-pasteur-gmcv7u'` o similar.

> Si el repositorio es privado, Git le pedirá ingresar a GitHub; en Windows se abre una ventana del navegador. Acepte.

### Paso 7 · Revisar el catálogo de categorías (importante)
1. Abra la carpeta `Documents/cursovibecode` en el explorador de archivos (Finder en Mac).
2. Abra con el Bloc de notas (Windows) o TextEdit (Mac) el archivo:
   `supabase/migrations/20260924000002_catalogo.sql`
3. Cada línea tiene la forma `('Categoría ISO', 'Subcategoría'),`. Compruebe que cada subcategoría esté en la categoría que usted quiere.
   Por ejemplo, `('Seguridad', 'Zonas peligrosas'),`.
4. Si algo está mal, cambie **solo el texto de la categoría** de esa línea, respetando exactamente las comillas y la coma final. Guarde.

> Hágalo **antes** del Paso 10. Corregir el catálogo después requiere una migración nueva.

### Paso 8 · Preparar y conectar el CLI de Supabase
En la terminal, dentro de la carpeta `cursovibecode`:

```
npx supabase init
```
- La primera vez pregunta `Need to install the following packages: supabase… Ok to proceed? (y)`: escriba **y** y Enter.
- Si pregunta `Generate VS Code settings for Deno?` o `IntelliJ`: escriba **N** y Enter.
- Debe terminar con `Finished supabase init`.

```
npx supabase login
```
- Se abre el navegador; presione **Authorize**. Si pide copiar un código de verificación, péguelo en la terminal.
- En la terminal debe aparecer `You are now logged in`.

### Paso 9 · Vincular con su proyecto
Reemplace `SU_PROJECT_REF` por el dato del Paso 5:
```
npx supabase link --project-ref SU_PROJECT_REF
```
- Cuando pida `Enter your database password`, pegue la contraseña del Paso 4. En la terminal no se ve lo que escribe; es normal. Presione Enter.
- Debe terminar con `Finished supabase link`.

### Paso 10 · Crear las tablas, el catálogo y el bucket de imágenes
```
npx supabase db push
```
- Mostrará dos migraciones (`…_esquema.sql` y `…_catalogo.sql`) y preguntará `Do you want to push these migrations? [Y/n]`: escriba **Y** y Enter.
- Debe terminar con `Finished supabase db push`.

**Verifique en el panel de Supabase:**
- **Table Editor**: deben existir `categoria` (21 filas), `subcategoria` (59 filas), `imagen`, `analisis`, `revision` y `metodo_version`.
- **Storage**: debe existir el bucket `imagenes`, marcado como privado.

---

## Parte 5 · La función que llama a Claude

### Paso 11 · Desplegar la función
```
npx supabase functions deploy analizar-imagen
```
- Debe terminar con `Deployed Functions on project …: analizar-imagen`.
- Si aparece un error que menciona **Docker**, use:
  ```
  npx supabase functions deploy analizar-imagen --use-api
  ```
- Verifique en el panel: **Edge Functions** → debe aparecer `analizar-imagen`.

### Paso 12 · Guardar la API key de Anthropic como secreto
Hágalo **desde el panel**, así la clave no queda en el historial de la terminal:
1. Panel de Supabase → **Edge Functions** → **Secrets** (o **Manage secrets**).
2. **Add new secret**:
   - **Name:** `ANTHROPIC_API_KEY` (exactamente así, en mayúsculas)
   - **Value:** la clave `sk-ant-…` del Paso 3
3. Presione **Save**.
4. Borre la clave de donde la guardó temporalmente, si no era su gestor de contraseñas.

> La función lee el secreto en cada llamada; no hace falta volver a desplegarla.

---

## Parte 6 · Acceso: solo usted

### Paso 13 · Crear su usuario
1. Panel → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Escriba su correo y una contraseña, y **marque «Auto Confirm User»**.
3. Presione **Create user**.

### Paso 14 · Cerrar el registro público (no lo omita)
La clave anon estará visible en la página web. Sin este paso, cualquiera podría crear una cuenta y usar su crédito de Anthropic.
1. Panel → **Authentication** → **Sign In / Providers** (en algunas versiones, **Settings**).
2. Desactive **«Allow new users to sign up»**.
3. Presione **Save**.

---

## Parte 7 · Publicar la página

### Paso 15 · Poner la URL y la clave anon en la página
Lo más simple es editar el archivo directamente en GitHub:
1. Abra **https://github.com/srbenitez/cursovibecode**.
2. Arriba a la izquierda, en el selector de rama (dice `main` o similar), elija **`claude/affectionate-pasteur-gmcv7u`**.
3. Entre a `docs` → `js` → `config.js` y presione el **lápiz** (Edit this file).
4. Reemplace los dos valores, sin borrar las comillas:
   ```js
   export const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbGciOi…";   // o sb_publishable_…
   ```
5. Presione **Commit changes…** → **Commit changes**.

### Paso 16 · Activar GitHub Pages
1. En el repositorio: **Settings** → **Pages** (menú izquierdo).
2. En **Build and deployment → Source**, elija **Deploy from a branch**.
3. En **Branch**, elija `claude/affectionate-pasteur-gmcv7u` y la carpeta **`/docs`**. Presione **Save**.
4. Espere 1 a 3 minutos y recargue la página. Arriba aparecerá: **«Your site is live at https://srbenitez.github.io/cursovibecode/»**.

> Si **Pages** no deja elegir la rama y dice que requiere un plan de pago, su repositorio es **privado**. Con el plan gratuito de GitHub, Pages solo funciona en repositorios públicos. Puede hacerlo público (*Settings → General → Change visibility*), porque el código no contiene secretos, o usar GitHub Pro.

---

## Parte 8 · Probar

### Paso 17 · Primera prueba
1. Abra `https://srbenitez.github.io/cursovibecode/`.
2. Ingrese con el correo y la contraseña del Paso 13.
3. Elija **Residuos sólidos → Acumulación de basura**, suba una foto de basura acumulada y presione **Enviar y analizar**. Tarda de 5 a 20 segundos.
4. Revise la tarjeta y marque **✓ Correcto** o **✗ Incorrecto**.
5. Continúe con las pruebas de la tabla del `README.md`, por ejemplo la misma foto con *Seguridad → Delitos violentos*, que debe dar «No determinable».

### Paso 18 · Ver cuánto va gastando
- **En Anthropic:** console.anthropic.com → **Usage**.
- **Por imagen, en Supabase:** panel → **SQL Editor** → **New query** → pegue esto → **Run**:
  ```sql
  select count(*) as imagenes,
         round(avg(tokens_entrada)) as tokens_entrada_prom,
         round(avg(tokens_salida))  as tokens_salida_prom,
         round((sum(tokens_entrada) * 2 + sum(tokens_salida) * 10) / 1e6, 4) as usd_total_estimado
  from analisis
  where estado = 'ok' and modelo_servido like 'claude-sonnet-5%';
  ```

---

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La página queda en «Cargando…» o no muestra categorías | `config.js` con valores incorrectos, o faltó el Paso 10 | Revise el Paso 15 (sin espacios ni comillas de más) y que `db push` haya terminado bien |
| «Invalid login credentials» | Contraseña distinta o usuario sin confirmar | Paso 13: borre el usuario y créelo de nuevo con **Auto Confirm User** |
| «Failed to send a request to the Edge Function» | La función no está desplegada | Repita el Paso 11 |
| «Sesión no válida» | La sesión expiró | Presione **Salir** y vuelva a ingresar |
| «API de Claude (401)…» | Secreto mal escrito | Paso 12: el nombre debe ser exactamente `ANTHROPIC_API_KEY` y el valor, la clave completa |
| «API de Claude (400)… credit balance» | Sin crédito en Anthropic | Paso 3: cargue crédito |
| «Límite de uso de la API» | Muchas imágenes seguidas | Espere un minuto y presione **Reintentar** |
| La foto del celular no sube (formato HEIC) | El navegador no lee HEIC | En el iPhone: *Ajustes → Cámara → Formatos → Más compatible*, o convierta la foto a JPG |
| GitHub Pages muestra 404 | Carpeta equivocada o aún publicando | Paso 16: carpeta `/docs`; espere 3 minutos |

Si algo no se resuelve, copie el mensaje de error exacto (sin claves) y compártalo en esta conversación.
