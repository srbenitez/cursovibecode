import { exigirSesion, pintarResultado, supabase, urlsFirmadas } from "./comun.js";

const app = document.querySelector("#app");
const paginaHTML = app.innerHTML;
const ORDEN_CONFIANZA = { baja: 0, media: 1, alta: 2 };

exigirSesion(app, () => {
  app.innerHTML = paginaHTML;
  const lista = app.querySelector("#lista");
  const resumen = app.querySelector("#resumen");
  const botones = app.querySelectorAll("[data-filtro]");

  async function cargar(filtro) {
    botones.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filtro === filtro)));
    resumen.className = "mensaje";
    resumen.textContent = "Cargando…";
    lista.innerHTML = "";

    let consulta = supabase.from("v_resultados").select("*")
      .order("creado_en", { ascending: false }).limit(200);
    if (filtro === "pendientes") consulta = consulta.is("correcto", null).eq("estado", "ok");
    if (filtro === "incorrectos") consulta = consulta.eq("correcto", false);

    const { data: filas, error } = await consulta;
    if (error) {
      resumen.className = "mensaje error";
      resumen.textContent = "No se pudo cargar: " + error.message;
      return;
    }
    // Pendientes: confianza baja primero, para revisar antes lo más dudoso
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

  botones.forEach((b) => (b.onclick = () => cargar(b.dataset.filtro)));
  cargar("pendientes");
});
