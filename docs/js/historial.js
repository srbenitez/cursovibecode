// Historial del equipo: imágenes enviadas (validar), encuestas enviadas y análisis manuales.
import { esc, exigirSesion, pintarResultado, supabase, urlsFirmadas } from "./comun.js";

const app = document.querySelector("#app");
const paginaHTML = app.innerHTML;
const $ = (s) => app.querySelector(s);
const status = document.querySelector("#status");

const ESTADOS = { recibido: "Recibido", en_revision: "En revisión", validado: "Validado", excluido: "Excluido" };
const RELACION = { si: "Corresponde al problema", no: "No corresponde", no_determinable: "No determinable" };
const CORTO = { si: "✓ Corresponde", no: "✗ No corresponde", no_determinable: "No determinable" };
const OBS = { observable: "Observable", indicio: "Indicio", no_observable: "No observable" };

let reportes = [];
let esAdmin = false;

function avisar(mensaje, error = false) {
  status.textContent = mensaje;
  status.classList.toggle("status-error", error);
}

function fecha(v) {
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));
}

exigirSesion(app, async () => {
  app.innerHTML = paginaHTML;
  ({ data: esAdmin } = await supabase.rpc("es_admin"));

  // Pestañas
  const tabs = [...app.querySelectorAll('[role="tab"]')];
  function abrir(tab) {
    tabs.forEach((t) => {
      const activa = t === tab;
      t.setAttribute("aria-selected", String(activa));
      $("#" + t.getAttribute("aria-controls")).hidden = !activa;
    });
    history.replaceState(null, "", "#" + tab.id.replace("tab-", ""));
    if (tab.id === "tab-manuales") cargarManuales("pendientes");
  }
  tabs.forEach((t) => (t.onclick = () => abrir(t)));

  if (!esAdmin) {
    const aviso = `<section class="admin-card"><p class="mensaje error">Su cuenta no está registrada como administradora, por eso no puede ver los reportes ciudadanos. Pida que agreguen su correo a la tabla «administradores».</p></section>`;
    $("#panel-imagenes").innerHTML = aviso;
    $("#panel-encuestas").innerHTML = aviso;
  } else {
    prepararImagenes();
    prepararEncuestas();
    await cargarReportes();
  }
  const inicial = tabs.find((t) => "#" + t.id.replace("tab-", "") === location.hash) ?? tabs[0];
  abrir(inicial);
});

async function cargarReportes() {
  avisar("Cargando…");
  const { data, error } = await supabase.from("v_reportes").select("*")
    .order("creado_en", { ascending: false }).limit(1000);
  if (error) return avisar("No fue posible consultar los reportes: " + error.message, true);
  reportes = data ?? [];
  avisar("");
  const conFoto = reportes.filter((r) => r.evidencia_ruta);
  const pendientes = conFoto.filter((r) => !r.imagen_revisada_en).length;
  $("#cuenta-imagenes").textContent = pendientes ? `${pendientes} por validar` : "";
  $("#cuenta-encuestas").textContent = String(reportes.length);
  pintarImagenes();
  pintarTabla();
}

// ═══════════════ Pestaña 1 · Imágenes enviadas ═══════════════
let filtroImg = "pendientes";

function prepararImagenes() {
  app.querySelectorAll("[data-filtro-img]").forEach((b) => (b.onclick = () => {
    filtroImg = b.dataset.filtroImg;
    app.querySelectorAll("[data-filtro-img]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    pintarImagenes();
  }));
}

async function pintarImagenes() {
  let lista = reportes.filter((r) => r.evidencia_ruta);
  if (filtroImg === "pendientes") lista = lista.filter((r) => !r.imagen_revisada_en);
  if (filtroImg === "no") lista = lista.filter((r) => r.ia_relacionada === "no");
  if (filtroImg === "sin-ia") lista = lista.filter((r) => !r.ia_relacionada);
  if (filtroImg === "validadas") lista = lista.filter((r) => r.imagen_revisada_en);
  $("#resumen-imagenes").textContent = lista.length
    ? `${lista.length} imagen(es).` : "No hay imágenes con este filtro.";
  const contenedor = $("#lista-imagenes");
  contenedor.innerHTML = "";
  const urls = await urlsFirmadasEvidencias(lista.map((r) => r.evidencia_ruta));
  for (const r of lista) {
    const div = document.createElement("div");
    contenedor.append(div);
    pintarTarjetaImagen(div, r, urls[r.evidencia_ruta]);
  }
}

async function urlsFirmadasEvidencias(rutas) {
  if (!rutas.length) return {};
  const { data } = await supabase.storage.from("reportes-evidencias").createSignedUrls(rutas, 3600);
  return Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl]));
}

function pintarTarjetaImagen(div, r, url) {
  const ia = r.ia_relacionada ? `
      <div class="etiquetas">
        <span class="etiqueta ${esc(r.ia_relacionada)}">IA: ${esc(RELACION[r.ia_relacionada])}</span>
        <span class="etiqueta">${esc(OBS[r.ia_observabilidad] ?? "")}</span>
        <span class="etiqueta">Confianza ${esc(r.ia_confianza)}</span>
      </div>
      ${r.ia_datos_identificables ? `<div class="advertencia">⚠ La IA detectó posibles datos identificables (rostros, placas…).</div>` : ""}
      <dl>
        <dt>Lo que ve la IA</dt><dd>${esc(r.ia_descripcion)}</dd>
        <dt>Motivo</dt><dd>${esc(r.ia_motivo)}</dd>
      </dl>` : `
      <div class="advertencia">La IA no alcanzó a revisar esta imagen cuando se envió el reporte.</div>
      <div class="fila-botones">
        <button class="button primary validar-ia">🤖 Validar con IA</button>
      </div>
      <p class="mensaje msg-ia"></p>`;

  div.innerHTML = `
    <article class="admin-card resultado">
      <div>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="Foto del reporte ${esc(r.id.slice(0, 8))}"></a>` : ""}</div>
      <div>
        <h3>${esc(r.subcategoria)}</h3>
        <div class="meta">${esc(r.categoria)} · ${esc(fecha(r.creado_en))} · código ${esc(r.id.slice(0, 8).toUpperCase())}</div>
        ${ia}
        <dl><dt>Descripción de la persona</dt><dd>${esc(r.descripcion_problema || "Sin descripción")}</dd></dl>
        <div class="revision"></div>
      </div>
    </article>`;
  pintarValidacion(div.querySelector(".revision"), r);

  const boton = div.querySelector(".validar-ia");
  if (boton) boton.onclick = async () => {
    const msg = div.querySelector(".msg-ia");
    boton.disabled = true;
    boton.classList.add("ia-cargando");
    msg.className = "mensaje msg-ia";
    msg.textContent = "Revisando la fotografía con la IA… (unos segundos)";
    const { data, error } = await supabase.functions.invoke("sugerir-descripcion", { body: { reporte_id: r.id } });
    if (error || data?.error) {
      let detalle = data?.error;
      try { detalle ??= (await error?.context?.json())?.error; } catch { /* sin cuerpo */ }
      msg.className = "mensaje msg-ia error";
      msg.textContent = "No se pudo validar: " + (detalle || error?.message || "intente de nuevo");
      boton.disabled = false;
      boton.classList.remove("ia-cargando");
      return;
    }
    const { data: fila } = await supabase.from("v_reportes").select("*").eq("id", r.id).single();
    if (fila) Object.assign(r, fila);
    pintarTarjetaImagen(div, r, url);
  };
}

function opciones(sel) {
  return Object.entries(RELACION).map(([v, t]) =>
    `<option value="${v}" ${v === sel ? "selected" : ""}>${esc(t)}</option>`).join("");
}

function pintarValidacion(zona, r) {
  if (r.imagen_revisada_en && !zona.dataset.editando) {
    const final = RELACION[r.imagen_relacionada_final] ?? "—";
    zona.innerHTML = `
      <div class="estado-revision ${r.imagen_ia_correcta === false ? "incorrecto" : "correcto"}">
        ${r.imagen_ia_correcta === true ? "✓ Validada: la IA acertó" : r.imagen_ia_correcta === false ? "✗ Validada: la IA se equivocó" : "✓ Validada"}
        · ${esc(final)}
      </div>
      ${r.imagen_comentario ? `<div class="meta">Comentario: ${esc(r.imagen_comentario)}</div>` : ""}
      <div class="meta">${esc(r.imagen_revisor)} · ${esc(fecha(r.imagen_revisada_en))}</div>
      <div class="fila-botones"><button class="button secondary cambiar">Cambiar validación</button></div>`;
    zona.querySelector(".cambiar").onclick = () => { zona.dataset.editando = "1"; pintarValidacion(zona, r); };
    return;
  }

  const conIa = Boolean(r.ia_relacionada);
  zona.innerHTML = `
    <div class="estado-revision">${conIa ? "¿La IA acertó?" : "¿La imagen corresponde al problema?"}</div>
    ${conIa ? `<div class="fila-botones">
      <button class="button secondary ok">✓ Sí, acertó</button>
      <button class="button secondary mal">✗ No, se equivocó</button>
    </div>` : ""}
    <form class="form-correccion" ${conIa ? "hidden" : ""}>
      <label>Valor correcto</label>
      <select name="relacionada">${opciones(conIa ? r.ia_relacionada : "si")}</select>
      <label>Comentario (opcional)</label>
      <textarea name="comentario" placeholder="Qué se ve en la foto que justifica su decisión"></textarea>
      <div class="fila-botones"><button class="button primary">Guardar validación</button></div>
    </form>
    <p class="mensaje"></p>`;

  const msg = zona.querySelector(".mensaje");
  const form = zona.querySelector("form");

  async function guardar(fila) {
    zona.querySelectorAll("button").forEach((b) => (b.disabled = true));
    msg.className = "mensaje";
    msg.textContent = "Guardando…";
    const { error } = await supabase.from("revision_reporte").insert({ reporte_id: r.id, ...fila });
    if (error) {
      msg.className = "mensaje error";
      msg.textContent = "No se pudo guardar: " + error.message;
      zona.querySelectorAll("button").forEach((b) => (b.disabled = false));
      return;
    }
    const { data } = await supabase.from("v_reportes").select("*").eq("id", r.id).single();
    if (data) Object.assign(r, data);
    delete zona.dataset.editando;
    pintarValidacion(zona, r);
    const pendientes = reportes.filter((x) => x.evidencia_ruta && !x.imagen_revisada_en).length;
    $("#cuenta-imagenes").textContent = pendientes ? `${pendientes} por validar` : "";
  }

  zona.querySelector(".ok")?.addEventListener("click", () => guardar({ correcto: true }));
  zona.querySelector(".mal")?.addEventListener("click", () => { form.hidden = false; });
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const datos = new FormData(form);
    const valor = datos.get("relacionada");
    if (conIa && valor === r.ia_relacionada) {
      msg.className = "mensaje error";
      msg.textContent = "Elija un valor distinto al de la IA, o marque «Sí, acertó».";
      return;
    }
    guardar({ correcto: conIa ? false : null, relacionada_corregida: valor, comentario: datos.get("comentario") || null });
  };
}

// ═══════════════ Pestaña 2 · Encuestas enviadas ═══════════════
function prepararEncuestas() {
  $("#refresh-reports").onclick = cargarReportes;
  $("#export-csv").onclick = exportarCsv;
  $("#close-detail").onclick = () => ($("#report-detail").hidden = true);
  $("#reports-body").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-id]");
    const r = b && reportes.find((x) => x.id === b.dataset.id);
    if (r) mostrarDetalle(r);
  });
  $("#reports-body").addEventListener("change", async (ev) => {
    const sel = ev.target.closest("select[data-estado]");
    if (!sel) return;
    sel.disabled = true;
    const { error } = await supabase.from("reportes_ciudadanos").update({ estado: sel.value }).eq("id", sel.dataset.estado);
    sel.disabled = false;
    if (error) return avisar("No se pudo cambiar el estado: " + error.message, true);
    const r = reportes.find((x) => x.id === sel.dataset.estado);
    if (r) r.estado = sel.value;
    avisar("");
  });
}

function pintarTabla() {
  const cuerpo = $("#reports-body");
  $("#record-count").textContent = `${reportes.length} ${reportes.length === 1 ? "encuesta" : "encuestas"}`;
  if (!reportes.length) {
    cuerpo.innerHTML = '<tr><td colspan="6" class="empty-table">Todavía no hay encuestas enviadas.</td></tr>';
    return;
  }
  cuerpo.innerHTML = reportes.map((r) => `
    <tr>
      <td>${esc(fecha(r.creado_en))}</td>
      <td><strong>${esc(r.categoria)}</strong><small>${esc(r.subcategoria)}</small></td>
      <td>${esc(r.gravedad)}/3</td>
      <td>${r.evidencia_ruta ? "📷" : "—"}${r.ia_relacionada ? `<small>${esc(CORTO[r.ia_relacionada])}</small>` : ""}</td>
      <td><select class="estado-select" data-estado="${esc(r.id)}">
        ${Object.entries(ESTADOS).map(([v, t]) => `<option value="${v}" ${v === r.estado ? "selected" : ""}>${t}</option>`).join("")}
      </select></td>
      <td><button class="table-action" type="button" data-id="${esc(r.id)}">Ver detalle</button></td>
    </tr>`).join("");
}

async function mostrarDetalle(r) {
  const campos = [
    ["Código", r.id.slice(0, 8).toUpperCase()], ["Fecha", fecha(r.creado_en)],
    ["Categoría", r.categoria], ["Subcategoría", r.subcategoria],
    ["Gravedad", `${r.gravedad}/3`], ["Frecuencia", r.frecuencia],
    ["Rango de edad", r.rango_edad], ["Vínculo territorial", r.vinculo_territorio.join(", ")],
    ["Afectación personal", r.afecta_personalmente ? `Sí · ${r.descripcion_afectacion}` : "No"],
    ["Origen de la descripción", { persona: "Escrita por la persona", ia: "Sugerida por la IA", ia_editada: "Sugerida por la IA y editada" }[r.descripcion_origen] ?? "—"],
    ["Descripción del problema", r.descripcion_problema || "Sin descripción"],
    ["IA · ¿corresponde?", r.ia_relacionada ? `${CORTO[r.ia_relacionada]} · ${OBS[r.ia_observabilidad]} · confianza ${r.ia_confianza}` : "Sin revisión automática"],
    ["Validación humana de la imagen", r.imagen_revisada_en ? `${RELACION[r.imagen_relacionada_final]} · ${r.imagen_revisor}` : (r.evidencia_ruta ? "Pendiente" : "Sin foto")],
    ["Consentimiento", `${r.consentimiento_version} · formulario ${r.formulario_version}`],
  ];
  $("#detail-content").innerHTML = campos
    .map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("");

  const d = 0.008;
  const bbox = [r.longitud - d, r.latitud - d, r.longitud + d, r.latitud + d].join(",");
  const punto = `${r.latitud},${r.longitud}`;
  $("#admin-map").innerHTML = `
    <iframe title="Mapa de la ubicación reportada" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(punto)}"></iframe>
    <div class="map-actions">
      <a class="button secondary" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(punto)}" target="_blank" rel="noopener noreferrer">Google Maps</a>
      <a class="button secondary" href="https://www.waze.com/ul?ll=${encodeURIComponent(punto)}&navigate=yes" target="_blank" rel="noopener noreferrer">Waze</a>
    </div>`;

  const zona = $("#admin-image");
  zona.innerHTML = "";
  if (r.evidencia_ruta) {
    const urls = await urlsFirmadasEvidencias([r.evidencia_ruta]);
    zona.innerHTML = urls[r.evidencia_ruta]
      ? `<img src="${esc(urls[r.evidencia_ruta])}" alt="Evidencia fotográfica">`
      : "No fue posible abrir la evidencia fotográfica.";
  }
  const panel = $("#report-detail");
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function exportarCsv() {
  if (!reportes.length) return avisar("No existen registros para exportar.", true);
  const columnas = ["id", "creado_en", "categoria", "subcategoria", "gravedad", "frecuencia", "latitud", "longitud",
    "descripcion_problema", "descripcion_origen", "afecta_personalmente", "descripcion_afectacion", "rango_edad",
    "vinculo_territorio", "evidencia_ruta", "ia_relacionada", "ia_observabilidad", "ia_confianza", "ia_motivo",
    "ia_datos_identificables", "imagen_ia_correcta", "imagen_relacionada_final", "imagen_revisor", "estado",
    "consentimiento_version", "formulario_version"];
  const q = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const filas = [columnas.join(","), ...reportes.map((r) =>
    columnas.map((c) => q(Array.isArray(r[c]) ? r[c].join(" | ") : r[c])).join(","))];
  const url = URL.createObjectURL(new Blob(["﻿" + filas.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `encuestas-ciudadanas-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ═══════════════ Pestaña 3 · Análisis manuales ═══════════════
const ORDEN_CONFIANZA = { baja: 0, media: 1, alta: 2 };
let manualesListos = false;

async function cargarManuales(filtro) {
  if (!manualesListos) {
    app.querySelectorAll("[data-filtro]").forEach((b) => (b.onclick = () => cargarManuales(b.dataset.filtro)));
    manualesListos = true;
  }
  app.querySelectorAll("[data-filtro]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filtro === filtro)));
  const resumen = $("#resumen");
  const lista = $("#lista");
  resumen.className = "mensaje";
  resumen.textContent = "Cargando…";
  lista.innerHTML = "";

  let consulta = supabase.from("v_resultados").select("*").order("creado_en", { ascending: false }).limit(200);
  if (filtro === "pendientes") consulta = consulta.is("correcto", null).eq("estado", "ok");
  if (filtro === "incorrectos") consulta = consulta.eq("correcto", false);
  const { data: filas, error } = await consulta;
  if (error) {
    resumen.className = "mensaje error";
    resumen.textContent = "No se pudo cargar: " + error.message;
    return;
  }
  if (filtro === "pendientes") {
    filas.sort((a, b) => (ORDEN_CONFIANZA[a.confianza] ?? 0) - (ORDEN_CONFIANZA[b.confianza] ?? 0));
  }
  resumen.textContent = filas.length
    ? `${filas.length} resultado(s)${filtro === "pendientes" ? ", los de confianza baja primero" : ""}.`
    : "No hay resultados con este filtro.";
  const urls = await urlsFirmadas([...new Set(filas.map((f) => f.storage_path))]);
  for (const fila of filas) {
    const contenedor = document.createElement("div");
    lista.append(contenedor);
    pintarResultado(contenedor, fila, urls[fila.storage_path]);
  }
}
