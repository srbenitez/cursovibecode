// Formulario ciudadano en una sola página: mapa interactivo y revisión de la foto con IA al enviar.
import { esc, nuevoId, reducirImagen, supabase } from "./comun.js";

const FORM_VERSION = "3.0.0";               // debe coincidir con la política RLS
const CONSENT_VERSION = "2026-09-24-ia";
const LADO_MAYOR = 1092;                    // foto reducida: menos costo y sin EXIF
const MAX_ORIGINAL = 25 * 1024 * 1024;      // tamaño máximo del archivo original
const MAX_REVISIONES_IA = 6;                // por visita, para cuidar el crédito
const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const CENTRO_INICIAL = [-3.99313, -79.20422]; // Loja

const $ = (id) => document.getElementById(id);
const reportForm = $("report-form");
const category = $("category");
const subcategory = $("subcategory");
const comment = $("comment");
const evidence = $("evidence");
const dialogo = $("dialogo-ia");

let subcategorias = [];     // [{id, nombre, categoria:{id, nombre}}]
let imagen = null;          // { blob, base64, url, tamano }
const cacheIa = new Map();  // subcategoria_id → respuesta de la IA para la foto actual
let revisionesIa = 0;
let descripcionOrigen = null; // 'persona' | 'ia' | 'ia_editada'
let enviando = false;

function announce(message) {
  $("status").textContent = message;
}

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
});
subcategory.addEventListener("change", () => clearError("subcategory"));

function subcategoriaElegida() {
  return subcategorias.find((s) => String(s.id) === subcategory.value);
}

// ── Mapa interactivo (Leaflet + OpenStreetMap) ──────────────────────────────
let mapa = null;
let marcador = null;

function iniciarMapa() {
  if (!window.L) {
    $("location-message").textContent = "No se pudo cargar el mapa. Ingrese la latitud y la longitud manualmente.";
    return;
  }
  mapa = L.map("mapa", { scrollWheelZoom: false }).setView(CENTRO_INICIAL, 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);
  mapa.on("click", (e) => ponerMarcador(e.latlng.lat, e.latlng.lng));
}

function ponerMarcador(lat, lon, { centrar = false } = {}) {
  $("latitude").value = lat.toFixed(6);
  $("longitude").value = lon.toFixed(6);
  clearError("location");
  if (!mapa) return;
  if (!marcador) {
    marcador = L.marker([lat, lon], { draggable: true }).addTo(mapa);
    marcador.on("dragend", () => {
      const p = marcador.getLatLng();
      $("latitude").value = p.lat.toFixed(6);
      $("longitude").value = p.lng.toFixed(6);
    });
  } else {
    marcador.setLatLng([lat, lon]);
  }
  if (centrar) mapa.setView([lat, lon], 17);
  $("location-message").textContent = "Lugar marcado. Puede arrastrar el marcador o tocar otro punto para corregirlo.";
}

["latitude", "longitude"].forEach((id) => $(id).addEventListener("change", () => {
  const lat = Number($("latitude").value);
  const lon = Number($("longitude").value);
  if ($("latitude").value && $("longitude").value && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    ponerMarcador(lat, lon, { centrar: true });
  }
}));

$("get-location").addEventListener("click", () => {
  const message = $("location-message");
  if (!navigator.geolocation) {
    message.textContent = "El navegador no permite obtener la ubicación. Toque el mapa para marcar el lugar.";
    return;
  }
  message.textContent = "Solicitando permiso de ubicación…";
  navigator.geolocation.getCurrentPosition(
    (pos) => ponerMarcador(pos.coords.latitude, pos.coords.longitude, { centrar: true }),
    () => { message.textContent = "No se obtuvo la ubicación. Toque el mapa para marcar el lugar."; },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
});

// ── Foto ────────────────────────────────────────────────────────────────────
evidence.addEventListener("change", async () => {
  const preview = $("file-preview");
  clearError("evidence");
  if (imagen?.url) URL.revokeObjectURL(imagen.url);
  imagen = null;
  cacheIa.clear();
  preview.hidden = true;
  preview.innerHTML = "";
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
  preview.innerHTML = `<strong>${esc(file.name)} · ${formatBytes(imagen.tamano)} · se revisará al enviar</strong>
    <img src="${imagen.url}" alt="Vista previa de la fotografía">
    <div class="fila-botones"><button type="button" class="button secondary" id="quitar-foto">Quitar foto</button></div>`;
  preview.hidden = false;
  $("quitar-foto").onclick = () => { evidence.value = ""; evidence.dispatchEvent(new Event("change")); };
});

function aBase64(blob) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result).split(",")[1]);
    lector.onerror = mal;
    lector.readAsDataURL(blob);
  });
}

async function revisarConIa(subId) {
  if (cacheIa.has(subId)) return cacheIa.get(subId);
  if (revisionesIa >= MAX_REVISIONES_IA) {
    return { error: "Se alcanzó el número de revisiones automáticas de esta visita." };
  }
  revisionesIa++;
  const { data, error } = await supabase.functions.invoke("sugerir-descripcion", {
    body: { imagen_base64: imagen.base64, subcategoria_id: Number(subId) },
  });
  if (error || !data || data.error) {
    let detalle = data?.error;
    try { detalle ??= (await error?.context?.json())?.error; } catch { /* sin cuerpo */ }
    return { error: detalle || "No fue posible revisar la foto en este momento." };
  }
  cacheIa.set(subId, data);
  return data;
}

// ── Descripción, afectación ─────────────────────────────────────────────────
comment.addEventListener("input", () => {
  $("comment-count").textContent = `${comment.value.length}/300`;
  if (!comment.value.trim()) descripcionOrigen = null;
  else if (descripcionOrigen === "ia" || descripcionOrigen === "ia_editada") descripcionOrigen = "ia_editada";
  else descripcionOrigen = "persona";
});

document.querySelectorAll('input[name="affected"]').forEach((input) => {
  input.addEventListener("change", () => {
    const afectado = input.value === "Sí" && input.checked;
    $("impact-field").hidden = !afectado;
    if (!afectado) $("impact").value = "";
  });
});

["consent", "adult"].forEach((id) => $(id).addEventListener("change", () => clearError("consent")));

// Al corregir una respuesta, se borra su mensaje de error.
reportForm.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.type === "radio" || el.type === "checkbox") {
    const error = $(`${el.name === "roles" ? "roles" : el.name}-error`);
    if (error && el.name !== "consent" && el.name !== "adult") error.textContent = "";
  } else if (el.id) {
    clearError(el.id);
  }
});

// ── Validación ──────────────────────────────────────────────────────────────
function formatBytes(bytes) {
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

function validar() {
  let primero = null;
  const marcar = (el) => { primero ||= el; };

  clearError("consent");
  if (!$("consent").checked || !$("adult").checked) {
    setError("consent", "Para enviar, marque que acepta participar y que tiene 18 años o más.");
    marcar($("consent"));
  }
  ["category", "subcategory", "frequency", "age-range"].forEach((id) => {
    clearError(id);
    if (!$(id).value) { setError(id, "Este campo es obligatorio."); marcar($(id)); }
  });
  for (const group of ["severity", "affected"]) {
    const checked = document.querySelector(`input[name="${group}"]:checked`);
    $(`${group}-error`).textContent = checked ? "" : "Seleccione una opción.";
    if (!checked) marcar(document.querySelector(`input[name="${group}"]`));
  }
  const lat = Number($("latitude").value);
  const lon = Number($("longitude").value);
  clearError("location");
  if (!$("latitude").value || !$("longitude").value || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    setError("location", "Marque en el mapa el lugar del problema.");
    marcar($("mapa"));
  }
  const roles = document.querySelectorAll('input[name="roles"]:checked');
  $("roles-error").textContent = roles.length ? "" : "Seleccione al menos un vínculo.";
  if (!roles.length) marcar(document.querySelector('input[name="roles"]'));
  clearError("impact");
  if (document.querySelector('input[name="affected"]:checked')?.value === "Sí" && !$("impact").value.trim()) {
    setError("impact", "Explique brevemente cómo le afecta.");
    marcar($("impact"));
  }
  if (primero) {
    primero.scrollIntoView({ behavior: "smooth", block: "center" });
    primero.focus?.({ preventScroll: true });
  }
  return !primero;
}

// ── Envío: validar formulario → revisar foto con IA → confirmar → guardar ───
reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (enviando) return;
  if (!validar()) return announce("Revise los campos señalados antes de enviar.");
  announce("");
  if (!imagen) return guardar(null);

  const sub = subcategoriaElegida();
  abrirDialogo(`
    <p class="eyebrow">Revisión con IA</p>
    <h2 id="dialogo-titulo" class="ia-cargando">Revisando su fotografía…</h2>
    <p>Estamos verificando si la foto corresponde a «${esc(sub.nombre)}». Toma unos segundos.</p>`);
  const ia = await revisarConIa(subcategory.value);
  mostrarResultadoIa(ia, sub);
});

function abrirDialogo(html) {
  $("dialogo-cuerpo").innerHTML = html;
  if (!dialogo.open) dialogo.showModal();
}

function mostrarResultadoIa(ia, sub) {
  if (ia.error) {
    abrirDialogo(`
      <p class="eyebrow">Revisión con IA</p>
      <h2 id="dialogo-titulo">No fue posible revisar la foto</h2>
      <p>${esc(ia.error)} Puede enviar el reporte igual: el equipo investigador revisará la foto.</p>
      <div class="fila-botones">
        <button type="button" class="button primary" data-accion="enviar">Enviar reporte</button>
        <button type="button" class="button secondary" data-accion="volver">Volver al formulario</button>
      </div>`);
    return conectarBotones(null);
  }

  const privacidad = ia.datos_identificables
    ? `<div class="advertencia">⚠ La foto parece mostrar rostros, placas u otros datos que identifican a personas. Si puede, cambie la foto por otra sin ellos.</div>` : "";
  const tieneDescripcion = comment.value.trim().length > 0;
  const opcionDescripcion = ia.relacionada === "no" ? "" : `
    <label class="usar-sugerencia"><input type="checkbox" id="usar-sugerencia" ${tieneDescripcion ? "" : "checked"}>
      <span>Usar esta descripción en mi reporte${tieneDescripcion ? " (reemplaza la que escribí)" : ""}</span></label>`;

  const encabezado = {
    si: `<h2 id="dialogo-titulo" class="ok">✓ La foto corresponde a «${esc(sub.nombre)}»</h2>`,
    no: `<h2 id="dialogo-titulo" class="mal">✗ La foto no parece representar «${esc(sub.nombre)}»</h2>`,
    no_determinable: `<h2 id="dialogo-titulo">No se puede confirmar este problema con una foto</h2>`,
  }[ia.relacionada];
  const botones = ia.relacionada === "no" ? `
      <button type="button" class="button primary" data-accion="cambiar">Cambiar la foto</button>
      <button type="button" class="button secondary" data-accion="volver">Revisar la categoría</button>
      <button type="button" class="button secondary" data-accion="enviar">Enviar de todos modos</button>` : `
      <button type="button" class="button primary" data-accion="enviar">Confirmar y enviar</button>
      <button type="button" class="button secondary" data-accion="volver">Volver al formulario</button>`;

  abrirDialogo(`
    <p class="eyebrow">Revisión con IA</p>
    ${encabezado}
    <div class="dialogo-foto"><img src="${imagen.url}" alt="Su fotografía"></div>
    <p>${esc(ia.motivo)}</p>
    <p class="meta">${ia.relacionada === "no" ? "Lo que muestra la foto:" : "Descripción sugerida:"}</p>
    <blockquote>${esc(ia.descripcion)}</blockquote>
    ${opcionDescripcion}
    ${privacidad}
    <div class="fila-botones">${botones}</div>`);
  conectarBotones(ia);
}

function conectarBotones(ia) {
  $("dialogo-cuerpo").querySelectorAll("[data-accion]").forEach((b) => {
    b.onclick = () => {
      const accion = b.dataset.accion;
      if (accion === "volver") return dialogo.close();
      if (accion === "cambiar") { dialogo.close(); return evidence.click(); }
      if (accion === "enviar") {
        if (ia && $("usar-sugerencia")?.checked) {
          comment.value = ia.descripcion.slice(0, 300);
          $("comment-count").textContent = `${comment.value.length}/300`;
          descripcionOrigen = "ia";
        }
        guardar(ia);
      }
    };
  });
}

async function guardar(ia) {
  enviando = true;
  const boton = $("enviar");
  boton.disabled = true;
  boton.textContent = "Enviando…";
  if (dialogo.open) {
    $("dialogo-cuerpo").querySelectorAll("button").forEach((b) => (b.disabled = true));
    $("dialogo-cuerpo").insertAdjacentHTML("beforeend", `<p class="mensaje ia-cargando">Enviando el reporte…</p>`);
  }

  const form = new FormData(reportForm);
  const id = nuevoId();
  try {
    let ruta = null;
    if (imagen) {
      ruta = `${id}.jpg`;
      const { error } = await supabase.storage.from("reportes-evidencias")
        .upload(ruta, imagen.blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error(`No se pudo cargar la imagen: ${error.message}`);
    }
    const descripcion = comment.value.trim() || null;
    const { error } = await supabase.from("reportes_ciudadanos").insert({
      id,
      consentimiento_aceptado: true,
      consentimiento_version: CONSENT_VERSION,
      mayor_edad_confirmado: true,
      formulario_version: FORM_VERSION,
      subcategoria_id: Number(subcategory.value),
      gravedad: Number(form.get("severity")),
      frecuencia: form.get("frequency"),
      latitud: Number($("latitude").value),
      longitud: Number($("longitude").value),
      descripcion_problema: descripcion,
      descripcion_origen: descripcion ? (descripcionOrigen ?? "persona") : null,
      evidencia_ruta: ruta,
      evidencia_tamano: imagen ? imagen.tamano : null,
      sugerencia_id: ia?.sugerencia_id ?? null,
      afecta_personalmente: form.get("affected") === "Sí",
      descripcion_afectacion: form.get("impact")?.trim() || null,
      rango_edad: form.get("ageRange"),
      vinculo_territorio: form.getAll("roles"),
    });
    if (error) throw new Error(`No se pudo guardar el reporte: ${error.message}`);

    if (dialogo.open) dialogo.close();
    const nota = !imagen ? "" : ia?.relacionada === "si"
      ? " La revisión automática confirmó que su foto corresponde al problema."
      : " El equipo investigador revisará su foto.";
    $("end-message").textContent = `Código de referencia: ${id.slice(0, 8).toUpperCase()}.${nota}`;
    $("formulario").hidden = true;
    $("end-panel").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("end-title").focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    if (dialogo.open) dialogo.close();
    announce("No fue posible enviar el reporte. Revise la conexión y vuelva a intentarlo; sus datos siguen en el formulario.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } finally {
    enviando = false;
    boton.disabled = false;
    boton.textContent = "Enviar reporte";
  }
}

// ── Reinicio ────────────────────────────────────────────────────────────────
$("start-over").addEventListener("click", () => {
  reportForm.reset();
  subcategory.innerHTML = '<option value="">Seleccione primero la categoría</option>';
  subcategory.disabled = true;
  $("impact-field").hidden = true;
  $("file-preview").hidden = true;
  $("file-preview").innerHTML = "";
  $("comment-count").textContent = "0/300";
  if (imagen?.url) URL.revokeObjectURL(imagen.url);
  imagen = null;
  cacheIa.clear();
  descripcionOrigen = null;
  if (marcador) { marcador.remove(); marcador = null; }
  document.querySelectorAll(".error").forEach((e) => (e.textContent = ""));
  $("end-panel").hidden = true;
  $("formulario").hidden = false;
  mapa?.invalidateSize();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

iniciarMapa();
cargarCatalogo();
