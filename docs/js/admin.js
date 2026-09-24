// Panel de administración: lista de reportes ciudadanos, detalle, estado y CSV.
import { esc, exigirSesion, supabase } from "./comun.js";

const app = document.querySelector("#app");
const paginaHTML = app.innerHTML;
const status = document.querySelector("#admin-status");

const ESTADOS = { recibido: "Recibido", en_revision: "En revisión", validado: "Validado", excluido: "Excluido" };
const IA = { si: "✓ Corresponde", no: "✗ No corresponde", no_determinable: "No determinable" };

let reportes = [];

function avisar(mensaje, error = false) {
  status.textContent = mensaje;
  status.classList.toggle("status-error", error);
}

function fecha(v) {
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));
}

exigirSesion(app, async () => {
  app.innerHTML = paginaHTML;
  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (!esAdmin) {
    app.innerHTML = "";
    avisar("Su cuenta no está registrada como administradora. Pida que agreguen su correo a la tabla «administradores».", true);
    return;
  }
  document.querySelector("#refresh-reports").onclick = cargar;
  document.querySelector("#export-csv").onclick = exportarCsv;
  document.querySelector("#close-detail").onclick = () => (document.querySelector("#report-detail").hidden = true);
  document.querySelector("#reports-body").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-id]");
    const r = b && reportes.find((x) => x.id === b.dataset.id);
    if (r) mostrarDetalle(r);
  });
  document.querySelector("#reports-body").addEventListener("change", async (ev) => {
    const sel = ev.target.closest("select[data-estado]");
    if (!sel) return;
    sel.disabled = true;
    const { error } = await supabase.from("reportes_ciudadanos")
      .update({ estado: sel.value }).eq("id", sel.dataset.estado);
    sel.disabled = false;
    if (error) return avisar("No se pudo cambiar el estado: " + error.message, true);
    const r = reportes.find((x) => x.id === sel.dataset.estado);
    if (r) r.estado = sel.value;
    avisar("");
  });
  cargar();
});

async function cargar() {
  avisar("Cargando reportes…");
  const { data, error } = await supabase.from("v_reportes").select("*")
    .order("creado_en", { ascending: false }).limit(1000);
  if (error) return avisar("No fue posible consultar los reportes: " + error.message, true);
  reportes = data ?? [];
  pintarTabla();
  avisar("");
}

function pintarTabla() {
  const cuerpo = document.querySelector("#reports-body");
  document.querySelector("#record-count").textContent = `${reportes.length} ${reportes.length === 1 ? "reporte" : "reportes"}`;
  if (!reportes.length) {
    cuerpo.innerHTML = '<tr><td colspan="6" class="empty-table">Todavía no existen reportes.</td></tr>';
    return;
  }
  cuerpo.innerHTML = reportes.map((r) => `
    <tr>
      <td>${esc(fecha(r.creado_en))}</td>
      <td><strong>${esc(r.categoria)}</strong><small>${esc(r.subcategoria)}</small></td>
      <td>${esc(r.gravedad)}/3</td>
      <td>${r.evidencia_ruta ? "📷 " : "—"}${r.ia_relacionada ? `<small>${esc(IA[r.ia_relacionada])}</small>` : ""}</td>
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
    ["IA · ¿corresponde al problema?", r.ia_relacionada ? `${IA[r.ia_relacionada]} · ${r.ia_observabilidad} · confianza ${r.ia_confianza}` : "Sin revisión automática"],
    ["IA · motivo", r.ia_motivo || "—"],
    ["IA · datos identificables", r.ia_datos_identificables == null ? "—" : r.ia_datos_identificables ? "⚠ Sí: revisar antes de usar" : "No detectados"],
    ["Consentimiento", `${r.consentimiento_version} · formulario ${r.formulario_version}`],
  ];
  document.querySelector("#detail-content").innerHTML = campos
    .map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("");

  const d = 0.008;
  const bbox = [r.longitud - d, r.latitud - d, r.longitud + d, r.latitud + d].join(",");
  const punto = `${r.latitud},${r.longitud}`;
  document.querySelector("#admin-map").innerHTML = `
    <iframe title="Mapa de la ubicación reportada" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(punto)}"></iframe>
    <div class="map-actions">
      <a class="button secondary" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(punto)}" target="_blank" rel="noopener noreferrer">Google Maps</a>
      <a class="button secondary" href="https://www.waze.com/ul?ll=${encodeURIComponent(punto)}&navigate=yes" target="_blank" rel="noopener noreferrer">Waze</a>
    </div>`;

  const zona = document.querySelector("#admin-image");
  zona.innerHTML = "";
  if (r.evidencia_ruta) {
    const { data, error } = await supabase.storage.from("reportes-evidencias").createSignedUrl(r.evidencia_ruta, 900);
    zona.innerHTML = !error && data?.signedUrl
      ? `<img src="${esc(data.signedUrl)}" alt="Evidencia fotográfica del reporte">`
      : "No fue posible abrir la evidencia fotográfica.";
  }
  const panel = document.querySelector("#report-detail");
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function exportarCsv() {
  if (!reportes.length) return avisar("No existen registros para exportar.", true);
  const columnas = ["id", "creado_en", "categoria", "subcategoria", "gravedad", "frecuencia", "latitud", "longitud",
    "descripcion_problema", "descripcion_origen", "afecta_personalmente", "descripcion_afectacion", "rango_edad",
    "vinculo_territorio", "evidencia_ruta", "ia_relacionada", "ia_observabilidad", "ia_confianza", "ia_motivo",
    "ia_datos_identificables", "estado", "consentimiento_version", "formulario_version"];
  const q = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const filas = [columnas.join(","), ...reportes.map((r) =>
    columnas.map((c) => q(Array.isArray(r[c]) ? r[c].join(" | ") : r[c])).join(","))];
  const url = URL.createObjectURL(new Blob(["﻿" + filas.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `reportes-ciudadanos-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
