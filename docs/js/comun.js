// Código compartido: cliente de Supabase, sesión y tarjeta de resultado con revisión.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const ETIQUETAS = {
  relacionada: { si: "Relacionada", no: "No relacionada", no_determinable: "No determinable" },
  observabilidad: { observable: "Observable", indicio: "Indicio", no_observable: "No observable" },
  confianza: { alta: "Confianza alta", media: "Confianza media", baja: "Confianza baja" },
  condiciones: {
    poca_luz: "Poca luz",
    lejano: "Problema lejano",
    parcial: "Parcialmente visible",
    multiples_problemas: "Varios problemas",
    reparado: "Parece reparado",
    baja_resolucion: "Baja resolución",
  },
};

export function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function fecha(iso) {
  return iso ? new Date(iso).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" }) : "";
}

// ── Sesión ────────────────────────────────────────────────────────────────
// Muestra el formulario de ingreso si no hay sesión; llama a alIngresar(usuario) cuando la hay.
export async function exigirSesion(contenedor, alIngresar) {
  const { data: { session } } = await supabase.auth.getSession();
  pintarUsuario(session?.user);
  if (session) return alIngresar(session.user);

  contenedor.innerHTML = `
    <section class="admin-card" style="max-width:480px;margin:24px auto">
      <h2>Ingreso del equipo investigador</h2>
      <p class="mensaje">Esta sección es solo para el equipo del proyecto.</p>
      <form id="form-ingreso">
        <div class="field"><label for="correo">Correo</label>
          <input id="correo" type="email" required autocomplete="username"></div>
        <div class="field"><label for="clave">Contraseña</label>
          <input id="clave" type="password" required autocomplete="current-password"></div>
        <div class="fila-botones"><button class="button primary">Ingresar</button></div>
        <p class="mensaje" id="msg-ingreso"></p>
      </form>
    </section>`;
  contenedor.querySelector("#form-ingreso").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = contenedor.querySelector("#msg-ingreso");
    msg.className = "mensaje";
    msg.textContent = "Ingresando…";
    const { error } = await supabase.auth.signInWithPassword({
      email: contenedor.querySelector("#correo").value,
      password: contenedor.querySelector("#clave").value,
    });
    if (error) {
      msg.className = "mensaje error";
      msg.textContent = "No se pudo ingresar: " + error.message;
    } else {
      location.reload();
    }
  });
}

function pintarUsuario(usuario) {
  const zona = document.querySelector("#usuario");
  if (!zona) return;
  if (!usuario) { zona.innerHTML = ""; return; }
  zona.innerHTML = `<span>${esc(usuario.email)}</span> <button class="button secondary" id="salir">Salir</button>`;
  zona.querySelector("#salir").onclick = async () => {
    await supabase.auth.signOut();
    location.reload();
  };
}

// ── Datos ─────────────────────────────────────────────────────────────────
export async function urlsFirmadas(rutas) {
  if (!rutas.length) return {};
  const { data } = await supabase.storage.from("imagenes").createSignedUrls(rutas, 3600);
  return Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl]));
}

export async function leerResultado(analisisId) {
  const { data, error } = await supabase
    .from("v_resultados").select("*").eq("analisis_id", analisisId).single();
  if (error) throw error;
  return data;
}

export async function analizar(imagenId, subcategoriaId) {
  const { data, error } = await supabase.functions.invoke("analizar-imagen", {
    body: { imagen_id: imagenId, subcategoria_id: subcategoriaId },
  });
  if (error) {
    let detalle = error.message;
    try { detalle = (await error.context.json()).error ?? detalle; } catch { /* sin cuerpo */ }
    throw new Error(detalle);
  }
  return data;
}

// ── Tarjeta de resultado ──────────────────────────────────────────────────
// Pinta el resultado del modelo y el bloque de revisión (✓ / ✗).
export function pintarResultado(contenedor, fila, urlImagen) {
  const f = fila;
  const cuerpo = f.estado === "ok" ? `
      <div class="etiquetas">
        <span class="etiqueta ${esc(f.relacionada)}">${esc(ETIQUETAS.relacionada[f.relacionada])}</span>
        <span class="etiqueta">${esc(ETIQUETAS.observabilidad[f.observabilidad])}</span>
        <span class="etiqueta">${esc(ETIQUETAS.confianza[f.confianza])}</span>
      </div>
      ${f.ilegible ? `<div class="advertencia">⚠ Imagen ilegible: el modelo no pudo ver su contenido.</div>` : ""}
      ${f.condiciones?.length ? `<div class="advertencia">⚠ ${f.condiciones.map((c) => esc(ETIQUETAS.condiciones[c] ?? c)).join(" · ")}</div>` : ""}
      <dl>
        <dt>Descripción de lo observable</dt><dd>${esc(f.descripcion)}</dd>
        <dt>Motivo</dt><dd>${esc(f.motivo)}</dd>
      </dl>
      <div class="revision"></div>`
    : `
      <div class="advertencia">⚠ ${f.estado === "rechazo" ? "El modelo declinó analizar la imagen." : "Error en el análisis."}
        ${esc(f.error)}</div>
      <div class="fila-botones"><button class="button secondary reintentar">Reintentar</button></div>
      <p class="mensaje"></p>`;

  contenedor.innerHTML = `
    <article class="admin-card resultado">
      <div>${urlImagen ? `<img src="${esc(urlImagen)}" alt="Imagen ${esc(f.codigo)}">` : ""}</div>
      <div>
        <h3>${esc(f.codigo)} · ${esc(f.subcategoria)}</h3>
        <div class="meta">${esc(f.categoria)} · método ${esc(f.metodo_version)}${f.modelo_servido ? ` (${esc(f.modelo_servido)})` : ""} · ${fecha(f.creado_en)}</div>
        ${cuerpo}
      </div>
    </article>`;

  if (f.estado === "ok") {
    pintarRevision(contenedor.querySelector(".revision"), f, () =>
      leerResultado(f.analisis_id).then((nueva) => pintarResultado(contenedor, nueva, urlImagen))
    );
  } else {
    const boton = contenedor.querySelector(".reintentar");
    boton.onclick = async () => {
      boton.disabled = true;
      const msg = contenedor.querySelector(".mensaje");
      msg.textContent = "Analizando…";
      try {
        pintarResultado(contenedor, await analizar(f.imagen_id, f.subcategoria_id), urlImagen);
      } catch (e) {
        msg.className = "mensaje error";
        msg.textContent = e.message;
        boton.disabled = false;
      }
    };
  }
}

function opciones(mapa, seleccionado) {
  return Object.entries(mapa)
    .map(([v, t]) => `<option value="${v}" ${v === seleccionado ? "selected" : ""}>${esc(t)}</option>`)
    .join("");
}

function pintarRevision(zona, f, alGuardar) {
  const revisada = f.correcto !== null && f.correcto !== undefined;

  if (revisada && !zona.dataset.editando) {
    const detalle = f.correcto ? "" : `
      <div class="meta">Valor correcto: ${esc(ETIQUETAS.relacionada[f.relacionada_final])} ·
        ${esc(ETIQUETAS.observabilidad[f.observabilidad_final])}</div>
      ${f.comentario ? `<div class="meta">Comentario: ${esc(f.comentario)}</div>` : ""}`;
    zona.innerHTML = `
      <div class="estado-revision ${f.correcto ? "correcto" : "incorrecto"}">
        ${f.correcto ? "✓ Revisado: correcto" : "✗ Revisado: incorrecto, corregido"}
      </div>
      ${detalle}
      <div class="meta">${esc(f.revisor_email)} · ${fecha(f.revisado_en)}</div>
      <div class="fila-botones"><button class="button secondary cambiar">Cambiar revisión</button></div>`;
    zona.querySelector(".cambiar").onclick = () => {
      zona.dataset.editando = "1";
      pintarRevision(zona, f, alGuardar);
    };
    return;
  }

  zona.innerHTML = `
    <div class="estado-revision">¿El resultado es correcto?</div>
    <div class="fila-botones">
      <button class="button secondary ok">✓ Correcto</button>
      <button class="button secondary mal">✗ Incorrecto</button>
    </div>
    <form class="form-correccion" hidden>
      <div class="correccion">
        <div>
          <label>Relacionada (valor correcto)</label>
          <select name="relacionada">${opciones(ETIQUETAS.relacionada, f.relacionada)}</select>
        </div>
        <div>
          <label>Observabilidad (valor correcto)</label>
          <select name="observabilidad">${opciones(ETIQUETAS.observabilidad, f.observabilidad)}</select>
        </div>
      </div>
      <label>Comentario (opcional)</label>
      <textarea name="comentario" placeholder="Qué vio usted que el modelo no vio"></textarea>
      <div class="fila-botones"><button class="button primary">Guardar corrección</button></div>
    </form>
    <p class="mensaje"></p>`;

  const msg = zona.querySelector(".mensaje");
  const form = zona.querySelector(".form-correccion");

  async function guardar(revision) {
    zona.querySelectorAll("button").forEach((b) => (b.disabled = true));
    msg.className = "mensaje";
    msg.textContent = "Guardando…";
    const { error } = await supabase.from("revision").insert({ analisis_id: f.analisis_id, ...revision });
    if (error) {
      msg.className = "mensaje error";
      msg.textContent = "No se pudo guardar: " + error.message;
      zona.querySelectorAll("button").forEach((b) => (b.disabled = false));
      return;
    }
    delete zona.dataset.editando;
    alGuardar();
  }

  zona.querySelector(".ok").onclick = () => guardar({ correcto: true });
  zona.querySelector(".mal").onclick = () => { form.hidden = false; };
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const datos = new FormData(form);
    const relacionada = datos.get("relacionada");
    const observabilidad = datos.get("observabilidad");
    if (relacionada === f.relacionada && observabilidad === f.observabilidad) {
      msg.className = "mensaje error";
      msg.textContent = "Cambie al menos uno de los dos valores, o marque «Correcto».";
      return;
    }
    guardar({
      correcto: false,
      relacionada_corregida: relacionada,
      observabilidad_corregida: observabilidad,
      comentario: datos.get("comentario") || null,
    });
  };
}

// ── Imágenes ──────────────────────────────────────────────────────────────
// Reduce al lado mayor fijo y re-codifica en JPEG (esto también elimina el EXIF, incluido el GPS).
export async function reducirImagen(file, ladoMayor) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const escala = Math.min(1, ladoMayor / Math.max(bmp.width, bmp.height));
  const ancho = Math.round(bmp.width * escala);
  const alto = Math.round(bmp.height * escala);
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext("2d").drawImage(bmp, 0, 0, ancho, alto);
  const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.88));
  return { blob, ancho, alto };
}

export async function huella(blob) {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Identificador único; crypto.randomUUID solo existe en páginas HTTPS.
export function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
