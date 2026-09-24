import { analizar, esc, exigirSesion, huella, nuevoId, pintarResultado, reducirImagen, supabase } from "./comun.js";

// Tamaño fijo de la imagen enviada al modelo (lado mayor, en píxeles).
// Forma parte del método: cambiarlo puede cambiar los resultados.
const LADO_MAYOR = 1568;

const app = document.querySelector("#app");
const formularioHTML = app.innerHTML;

exigirSesion(app, async (usuario) => {
  app.innerHTML = formularioHTML;
  const $ = (s) => app.querySelector(s);
  const selCategoria = $("#categoria");
  const selSub = $("#subcategoria");
  const archivo = $("#archivo");
  const vista = $("#vista-previa");
  const msg = $("#msg");
  const boton = $("#enviar");

  // Catálogo
  const { data: subcategorias, error } = await supabase
    .from("subcategoria").select("id, nombre, categoria(id, nombre)").order("nombre");
  if (error) {
    msg.className = "mensaje error";
    msg.textContent = "No se pudo cargar el catálogo: " + error.message;
    return;
  }
  const categorias = [...new Map(subcategorias.map((s) => [s.categoria.id, s.categoria])).values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  selCategoria.innerHTML = `<option value="">Elija una categoría</option>` +
    categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("");

  selCategoria.onchange = () => {
    const lista = subcategorias.filter((s) => String(s.categoria.id) === selCategoria.value);
    selSub.disabled = !lista.length;
    selSub.innerHTML = `<option value="">${lista.length ? "Elija una subcategoría" : "Elija primero la categoría"}</option>` +
      lista.map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("");
  };

  archivo.onchange = () => {
    const f = archivo.files[0];
    vista.hidden = !f;
    if (f) vista.src = URL.createObjectURL(f);
  };

  $("#form-analisis").onsubmit = async (ev) => {
    ev.preventDefault();
    boton.disabled = true;
    msg.className = "mensaje";
    try {
      msg.textContent = "Preparando la imagen…";
      const { blob, ancho, alto } = await reducirImagen(archivo.files[0], LADO_MAYOR);
      const sha256 = await huella(blob);

      // Si la misma foto ya se subió, se reutiliza (y se analiza de nuevo con esta subcategoría)
      let { data: imagen } = await supabase
        .from("imagen").select("id, storage_path").eq("sha256", sha256).maybeSingle();

      if (!imagen) {
        msg.textContent = "Subiendo…";
        const id = nuevoId();
        const ruta = `${usuario.id}/${id}.jpg`;
        const subida = await supabase.storage.from("imagenes")
          .upload(ruta, blob, { contentType: "image/jpeg" });
        if (subida.error) throw new Error("No se pudo subir: " + subida.error.message);

        const nueva = await supabase.from("imagen").insert({
          id, storage_path: ruta, sha256, ancho, alto, nombre_original: archivo.files[0].name,
        }).select("id, storage_path").single();
        if (nueva.error) throw new Error("No se pudo registrar: " + nueva.error.message);
        imagen = nueva.data;
      }

      msg.textContent = "Analizando con Claude… (puede tardar unos segundos)";
      const fila = await analizar(imagen.id, Number(selSub.value));
      pintarResultado($("#resultado"), fila, URL.createObjectURL(blob));
      msg.textContent = "Listo. Revise el resultado abajo.";
      $("#resultado").scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      msg.className = "mensaje error";
      msg.textContent = e.message;
    } finally {
      boton.disabled = false;
    }
  };
});
