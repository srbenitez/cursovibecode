// Formulario ciudadano: consentimiento → edad → reporte (con revisión IA de la imagen) → envío.
import { esc, nuevoId, reducirImagen, supabase } from "./comun.js";

const FORM_VERSION = "3.0.0";               // debe coincidir con la política RLS
const CONSENT_VERSION = "2026-09-24-ia";
const LADO_MAYOR = 1092;                    // foto reducida: menos costo y sin EXIF
const MAX_ORIGINAL = 25 * 1024 * 1024;      // tamaño máximo del archivo original
const MAX_REVISIONES_IA = 6;                // por visita, para cuidar el crédito
const TIPOS = ["image/jpeg", "image/png", "image/webp"];

const $ = (id) => document.getElementById(id);
const statusBox = $("status");
const reportForm = $("report-form");
const category = $("category");
const subcategory = $("subcategory");
const comment = $("comment");
const evidence = $("evidence");
const iaBox = $("ia-box");

let subcategorias = [];     // [{id, nombre, categoria:{id, nombre}}]
let imagen = null;          // { blob, base64, url, tamano }
let sugerencia = null;      // respuesta de la IA para la imagen y subcategoría actuales
const cacheIa = new Map();  // subcategoria_id → respuesta, para la foto actual (evita pagar dos veces)
let sugerenciaClave = "";   // "subcategoria_id" con la que se pidió la sugerencia
let revisionesIa = 0;
let descripcionOrigen = null; // 'persona' | 'ia' | 'ia_editada'
let textoIaAplicado = "";
let reportData = null;
let submitting = false;

// ── Mensajes y pasos ────────────────────────────────────────────────────────
function announce(message) {
  statusBox.textContent = message;
}

function showStep(step) {
  document.querySelectorAll(".step-panel").forEach((panel) => {
    const active = Number(panel.dataset.step) === step;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  $("end-panel").hidden = true;
  document.querySelectorAll("[data-step-indicator]").forEach((item) => {
    const n = Number(item.dataset.stepIndicator);
    item.classList.toggle("active", n === step);
    item.classList.toggle("complete", n < step);
  });
  announce("");
  window.scrollTo({ top: 0, behavior: "smooth" });
  const heading = document.querySelector(`#step-${step} h2`);
  if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
}

function endFlow(message) {
  document.querySelectorAll(".step-panel").forEach((panel) => (panel.hidden = true));
  $("end-message").textContent = message;
  $("end-panel").hidden = false;
  document.querySelectorAll("[data-step-indicator]").forEach((i) => i.classList.remove("active", "complete"));
  announce("");
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("end-title").focus({ preventScroll: true });
}

$("consent-next").addEventListener("click", () => {
  const d = document.querySelector('input[name="consent"]:checked');
  if (!d) return announce("Seleccione si acepta o no participar.");
  if (d.value === "decline") return endFlow("Su decisión ha sido respetada. No se habilitó el cuestionario ni se guardó información.");
  showStep(2);
});

$("age-next").addEventListener("click", () => {
  const d = document.querySelector('input[name="adult"]:checked');
  if (!d) return announce("Confirme si tiene 18 años o más.");
  if (d.value === "no") return endFlow("El cuestionario está dirigido únicamente a personas de 18 años o más. El proceso finalizó sin guardar información.");
  showStep(3);
});

document.querySelectorAll("[data-back]").forEach((b) =>
  b.addEventListener("click", () => showStep(Number(b.dataset.back)))
);

// ── Catálogo ISO 37120 (desde Supabase) ─────────────────────────────────────
async function cargarCatalogo() {
  const { data, error } = await supabase
    .from("subcategoria").select("id, nombre, categoria(id, nombre)").order("nombre");
  if (error || !data?.length) {
    category.innerHTML = `<option value="">No se pudo cargar el catálogo</option>`;
    announce("No fue posible cargar las categorías. Recargue la página en unos minutos.");
    return;
  }
  subcategorias = data;
  const categorias = [...new Map(data.map((s) => [s.categoria.id, s.categoria])).values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  category.innerHTML = `<option value="">Seleccione una categoría</option>` +
    categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("");
}

category.addEventListener("change", () => {
  const lista = subcategorias.filter((s) => String(s.categoria.id) === category.value);
  subcategory.innerHTML = `<option value="">${lista.length ? "Seleccione una subcategoría" : "Seleccione primero la categoría"}</option>` +
    lista.map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("");
  subcategory.disabled = !lista.length;
  clearError("category");
  alCambiarSubcategoria();
});

subcategory.addEventListener("change", () => {
  clearError("subcategory");
  alCambiarSubcategoria();
});

function nombreSubcategoria(id) {
  return subcategorias.find((s) => String(s.id) === String(id));
}

// ── Imagen y revisión con IA ────────────────────────────────────────────────
evidence.addEventListener("change", async () => {
  const preview = $("file-preview");
  clearError("evidence");
  if (imagen?.url) URL.revokeObjectURL(imagen.url);
  imagen = null;
  sugerencia = null;
  sugerenciaClave = "";
  cacheIa.clear();
  preview.hidden = true;
  preview.innerHTML = "";
  iaBox.hidden = true;
  if (!evidence.files.length) return;

  const file = evidence.files[0];
  if (!TIPOS.includes(file.type)) {
    evidence.value = "";
    return setError("evidence", "Seleccione una imagen JPG, PNG o WebP. En iPhone: Ajustes → Cámara → Formatos → Más compatible.");
  }
  if (file.size > MAX_ORIGINAL) {
    evidence.value = "";
    return setError("evidence", "La imagen es demasiado grande (máximo 25 MB).");
  }
  try {
    const { blob } = await reducirImagen(file, LADO_MAYOR);
    imagen = { blob, base64: await aBase64(blob), url: URL.createObjectURL(blob), tamano: blob.size };
  } catch {
    evidence.value = "";
    return setError("evidence", "No se pudo leer la imagen. Intente con otra fotografía.");
  }
  preview.innerHTML = `<strong>${esc(file.name)} · ${formatBytes(imagen.tamano)} (reducida)</strong>
    <img src="${imagen.url}" alt="Vista previa de la evidencia seleccionada">`;
  preview.hidden = false;
  revisarImagen();
});

function alCambiarSubcategoria() {
  if (imagen) revisarImagen();
}

async function revisarImagen() {
  const subId = subcategory.value;
  if (!imagen) return;
  if (!subId) {
    pintarIa("pendiente", `<span class="assist-tag">Revisión con IA</span>
      <strong class="titulo">Seleccione la categoría y la subcategoría</strong>
      <p>Cuando las elija, revisaremos si la foto corresponde al problema y le sugeriremos una descripción.</p>`);
    return;
  }
  if (cacheIa.has(subId)) {
    sugerencia = cacheIa.get(subId);
    sugerenciaClave = subId;
    return pintarSugerencia();
  }
  if (revisionesIa >= MAX_REVISIONES_IA) {
    sugerencia = null;
    pintarIa("pendiente", `<span class="assist-tag">Revisión con IA</span>
      <strong class="titulo">Se alcanzó el número de revisiones de esta visita</strong>
      <p>Puede continuar y enviar el reporte sin la sugerencia.</p>`);
    return;
  }

  revisionesIa++;
  sugerencia = null;
  sugerenciaClave = subId;
  pintarIa("pendiente", `<span class="assist-tag">Revisión con IA</span>
    <strong class="titulo ia-cargando">Revisando la fotografía…</strong>
    <p>Esto toma unos segundos. Puede seguir completando el formulario.</p>`);

  const { data, error } = await supabase.functions.invoke("sugerir-descripcion", {
    body: { imagen_base64: imagen.base64, subcategoria_id: Number(subId) },
  });
  if (sugerenciaClave !== subId || !imagen) return; // cambió algo mientras esperábamos
  if (error || !data || data.error) {
    let detalle = data?.error;
    try { detalle ??= (await error?.context?.json())?.error; } catch { /* sin cuerpo */ }
    sugerencia = null;
    sugerenciaClave = "";
    pintarIa("pendiente", `<span class="assist-tag">Revisión con IA</span>
      <strong class="titulo">No fue posible revisar la imagen ahora</strong>
      <p>${esc(detalle || "Puede continuar y enviar el reporte sin la sugerencia.")}</p>`);
    return;
  }
  sugerencia = data;
  cacheIa.set(subId, data);
  pintarSugerencia();
}

function pintarSugerencia() {
  const s = sugerencia;
  const sub = nombreSubcategoria(subcategory.value)?.nombre ?? "";
  const privacidad = s.datos_identificables
    ? `<div class="advertencia">⚠ La foto parece mostrar rostros, placas u otros datos que identifican a personas. Si puede, tome otra foto sin ellos.</div>`
    : "";
  const usar = `<button type="button" class="button primary" id="ia-usar">Usar esta descripción</button>`;
  const cambiar = `<button type="button" class="button secondary" id="ia-cambiar">Cambiar la foto</button>`;

  if (s.relacionada === "si") {
    pintarIa("si", `<span class="assist-tag">Revisión con IA</span>
      <strong class="titulo">✓ La foto corresponde a «${esc(sub)}»</strong>
      <p>${esc(s.motivo)}</p>
      <p>Descripción sugerida:</p><blockquote>${esc(s.descripcion)}</blockquote>
      ${privacidad}<div class="fila-botones">${usar}</div>`);
  } else if (s.relacionada === "no") {
    pintarIa("no", `<span class="assist-tag">Revisión con IA</span>
      <strong class="titulo">✗ La imagen no parece representar «${esc(sub)}»</strong>
      <p>${esc(s.motivo)}</p>
      <p>Lo que muestra la foto:</p><blockquote>${esc(s.descripcion)}</blockquote>
      ${privacidad}
      <p>Puede cambiar la foto, revisar la categoría elegida o continuar de todos modos: el equipo investigador revisará el reporte.</p>
      <div class="fila-botones">${cambiar}</div>`);
  } else {
    pintarIa("no_determinable", `<span class="assist-tag">Revisión con IA</span>
      <strong class="titulo">No se puede confirmar con una foto</strong>
      <p>${esc(s.motivo)}</p>
      <p>Descripción sugerida de lo que se ve:</p><blockquote>${esc(s.descripcion)}</blockquote>
      ${privacidad}<div class="fila-botones">${usar}</div>`);
  }
  $("ia-usar")?.addEventListener("click", () => {
    comment.value = s.descripcion.slice(0, 300);
    textoIaAplicado = comment.value;
    descripcionOrigen = "ia";
    actualizarContador();
    comment.focus();
  });
  $("ia-cambiar")?.addEventListener("click", () => evidence.click());
}

function pintarIa(tipo, html) {
  iaBox.className = `ia-box ${tipo}`;
  iaBox.innerHTML = html;
  iaBox.hidden = false;
}

function aBase64(blob) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result).split(",")[1]);
    lector.onerror = mal;
    lector.readAsDataURL(blob);
  });
}

// ── Descripción ─────────────────────────────────────────────────────────────
function actualizarContador() {
  $("comment-count").textContent = `${comment.value.length}/300`;
}

comment.addEventListener("input", () => {
  actualizarContador();
  clearError("comment");
  if (!comment.value.trim()) descripcionOrigen = null;
  else if (descripcionOrigen === "ia" || descripcionOrigen === "ia_editada") {
    descripcionOrigen = comment.value === textoIaAplicado ? "ia" : "ia_editada";
  } else descripcionOrigen = "persona";
});

// ── Afectación y ubicación ──────────────────────────────────────────────────
document.querySelectorAll('input[name="affected"]').forEach((input) => {
  input.addEventListener("change", () => {
    const afectado = input.value === "Sí" && input.checked;
    $("impact-field").hidden = !afectado;
    $("impact").required = afectado;
    if (!afectado) $("impact").value = "";
  });
});

$("get-location").addEventListener("click", () => {
  const message = $("location-message");
  if (!navigator.geolocation) {
    message.textContent = "El navegador no permite obtener la ubicación. Ingrese las coordenadas manualmente.";
    return;
  }
  message.textContent = "Solicitando permiso de ubicación…";
  navigator.geolocation.getCurrentPosition((pos) => {
    $("latitude").value = pos.coords.latitude.toFixed(6);
    $("longitude").value = pos.coords.longitude.toFixed(6);
    message.textContent = "Ubicación actual colocada como referencia. Modifíquela si el problema ocurre en otro lugar.";
    clearError("latitude");
    clearError("longitude");
  }, () => {
    message.textContent = "No se obtuvo la ubicación. Puede ingresar las coordenadas manualmente.";
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
});

// ── Validación ──────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const u = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

function setError(id, message) {
  $(id)?.setAttribute("aria-invalid", "true");
  const e = $(`${id}-error`);
  if (e) e.textContent = message;
}

function clearError(id) {
  $(id)?.removeAttribute("aria-invalid");
  const e = $(`${id}-error`);
  if (e) e.textContent = "";
}

function validateForm() {
  let valid = true;
  let first = null;
  const marcar = (el) => { valid = false; first ||= el; };

  ["category", "subcategory", "latitude", "longitude", "age-range", "frequency"].forEach((id) => {
    clearError(id);
    if (!$(id).value.trim()) { setError(id, "Este campo es obligatorio."); marcar($(id)); }
  });
  const lat = Number($("latitude").value);
  const lon = Number($("longitude").value);
  if ($("latitude").value && (lat < -90 || lat > 90)) { setError("latitude", "Ingrese una latitud entre -90 y 90."); marcar($("latitude")); }
  if ($("longitude").value && (lon < -180 || lon > 180)) { setError("longitude", "Ingrese una longitud entre -180 y 180."); marcar($("longitude")); }

  for (const group of ["severity", "affected"]) {
    const checked = document.querySelector(`input[name="${group}"]:checked`);
    $(`${group}-error`).textContent = checked ? "" : "Seleccione una opción.";
    if (!checked) marcar(document.querySelector(`input[name="${group}"]`));
  }
  const roles = document.querySelectorAll('input[name="roles"]:checked');
  $("roles-error").textContent = roles.length ? "" : "Seleccione al menos un vínculo.";
  if (!roles.length) marcar(document.querySelector('input[name="roles"]'));

  clearError("impact");
  if (document.querySelector('input[name="affected"]:checked')?.value === "Sí" && !$("impact").value.trim()) {
    setError("impact", "Explique brevemente cómo le afecta.");
    marcar($("impact"));
  }
  if (!valid && first) first.focus();
  return valid;
}

reportForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validateForm()) return announce("Revise los campos señalados antes de continuar.");
  const form = new FormData(reportForm);
  const sub = nombreSubcategoria(form.get("subcategory"));
  const iaVigente = sugerencia && sugerenciaClave === String(sub.id) ? sugerencia : null;
  reportData = {
    id: nuevoId(),
    subcategoriaId: sub.id,
    categoria: sub.categoria.nombre,
    subcategoria: sub.nombre,
    gravedad: Number(form.get("severity")),
    frecuencia: form.get("frequency"),
    latitud: Number(form.get("latitude")),
    longitud: Number(form.get("longitude")),
    descripcion: form.get("comment")?.trim() || null,
    descripcionOrigen: form.get("comment")?.trim() ? (descripcionOrigen ?? "persona") : null,
    ia: iaVigente,
    afectado: form.get("affected") === "Sí",
    descripcionAfectacion: form.get("impact")?.trim() || null,
    rangoEdad: form.get("ageRange"),
    vinculos: form.getAll("roles"),
  };
  renderSummary();
  showStep(4);
});

function renderSummary() {
  const r = reportData;
  const ia = r.ia
    ? { si: "Corresponde al problema", no: "No parece representar el problema", no_determinable: "No se puede confirmar con una foto" }[r.ia.relacionada]
    : (imagen ? "Sin revisión automática" : "—");
  const items = [
    ["Categoría", r.categoria], ["Subcategoría", r.subcategoria],
    ["Gravedad", `${r.gravedad} de 3`], ["Frecuencia", r.frecuencia],
    ["Ubicación del problema", `${r.latitud}, ${r.longitud}`],
    ["Rango de edad", r.rangoEdad], ["Vínculo con el territorio", r.vinculos.join(", ")],
    ["Afectación personal", (r.afectado ? "Sí" : "No") + (r.descripcionAfectacion ? ` · ${r.descripcionAfectacion}` : "")],
    ["Descripción del problema", r.descripcion || "Sin descripción", true],
    ["Evidencia", imagen ? `Fotografía adjunta (${formatBytes(imagen.tamano)})` : "Sin fotografía"],
    ["Revisión de la imagen con IA", ia],
  ];
  const summary = $("report-summary");
  summary.innerHTML = "";
  items.forEach(([label, value, wide]) => {
    const item = document.createElement("div");
    item.className = `summary-item${wide ? " wide" : ""}`;
    const n = document.createElement("span"); n.textContent = label;
    const v = document.createElement("strong"); v.textContent = value;
    item.append(n, v);
    summary.appendChild(item);
  });
  renderMapPreview(r.latitud, r.longitud);
}

function renderMapPreview(lat, lon) {
  const d = 0.008;
  const bbox = [lon - d, lat - d, lon + d, lat + d].join(",");
  const osm = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
  $("map-preview").innerHTML = `<iframe title="Mapa de la ubicación del problema" loading="lazy" src="${osm}"></iframe>`;
}

// ── Envío a Supabase ────────────────────────────────────────────────────────
$("submit-report").addEventListener("click", async () => {
  if (!reportData || submitting) return;
  const r = reportData;
  const boton = $("submit-report");
  submitting = true;
  boton.disabled = true;
  boton.textContent = "Enviando…";
  announce("Enviando el reporte de forma segura…");

  try {
    let ruta = null;
    if (imagen) {
      ruta = `${r.id}.jpg`;
      const { error } = await supabase.storage.from("reportes-evidencias")
        .upload(ruta, imagen.blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error(`No se pudo cargar la imagen: ${error.message}`);
    }
    const { error } = await supabase.from("reportes_ciudadanos").insert({
      id: r.id,
      consentimiento_aceptado: true,
      consentimiento_version: CONSENT_VERSION,
      mayor_edad_confirmado: true,
      formulario_version: FORM_VERSION,
      subcategoria_id: r.subcategoriaId,
      gravedad: r.gravedad,
      frecuencia: r.frecuencia,
      latitud: r.latitud,
      longitud: r.longitud,
      descripcion_problema: r.descripcion,
      descripcion_origen: r.descripcionOrigen,
      evidencia_ruta: ruta,
      evidencia_tamano: imagen ? imagen.tamano : null,
      sugerencia_id: r.ia?.sugerencia_id ?? null,
      afecta_personalmente: r.afectado,
      descripcion_afectacion: r.descripcionAfectacion,
      rango_edad: r.rangoEdad,
      vinculo_territorio: r.vinculos,
    });
    if (error) throw new Error(`No se pudo guardar el reporte: ${error.message}`);
    endFlow(`El reporte fue enviado correctamente. Código de referencia: ${r.id.slice(0, 8).toUpperCase()}`);
  } catch (e) {
    console.error(e);
    announce("No fue posible enviar el reporte. Revise la conexión y vuelva a intentarlo; sus datos siguen en esta pantalla.");
    boton.disabled = false;
    boton.textContent = "Enviar reporte";
  } finally {
    submitting = false;
  }
});

// ── Reinicio ────────────────────────────────────────────────────────────────
function resetAll() {
  reportForm.reset();
  document.querySelectorAll('input[name="consent"], input[name="adult"]').forEach((i) => (i.checked = false));
  subcategory.innerHTML = '<option value="">Seleccione primero la categoría</option>';
  subcategory.disabled = true;
  $("impact-field").hidden = true;
  $("file-preview").hidden = true;
  $("file-preview").innerHTML = "";
  $("map-preview").innerHTML = "";
  iaBox.hidden = true;
  if (imagen?.url) URL.revokeObjectURL(imagen.url);
  imagen = null;
  sugerencia = null;
  sugerenciaClave = "";
  cacheIa.clear();
  descripcionOrigen = null;
  reportData = null;
  actualizarContador();
  $("submit-report").disabled = false;
  $("submit-report").textContent = "Enviar reporte";
  document.querySelectorAll(".error").forEach((e) => (e.textContent = ""));
  showStep(1);
}
$("reset-form").addEventListener("click", resetAll);
$("start-over").addEventListener("click", resetAll);

cargarCatalogo();
