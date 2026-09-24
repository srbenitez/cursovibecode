// Edge Function «analizar-imagen»
// Entrada (POST JSON): { imagen_id: uuid, subcategoria_id: number }
// Salida: la fila de v_resultados del análisis recién creado.
//
// Secretos: ANTHROPIC_API_KEY (lo configura usted en Supabase).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los entrega Supabase automáticamente.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import {
  aplicarReglasDuras,
  ESFUERZO,
  ESQUEMA,
  mensajeUsuario,
  MODELO,
  PROMPT_SISTEMA,
  type Resultado,
  VERSION,
} from "./metodo.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  // 1. Solo usuarios con sesión iniciada
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const { data: auth } = token ? await supabase.auth.getUser(token) : { data: null };
  const usuario = auth?.user;
  if (!usuario) return json({ error: "Sesión no válida" }, 401);

  let imagenId: string, subcategoriaId: number;
  try {
    ({ imagen_id: imagenId, subcategoria_id: subcategoriaId } = await req.json());
    if (!imagenId || !subcategoriaId) throw new Error();
  } catch {
    return json({ error: "Se requieren imagen_id y subcategoria_id" }, 400);
  }

  // 2. Datos de la imagen y de la subcategoría
  const { data: imagen } = await supabase
    .from("imagen").select("id, codigo, storage_path").eq("id", imagenId).single();
  if (!imagen) return json({ error: "Imagen no encontrada" }, 404);
  if (!imagen.codigo) return json({ error: "La imagen no tiene identificador" }, 400);

  const { data: sub } = await supabase
    .from("subcategoria").select("id, nombre, categoria(nombre)").eq("id", subcategoriaId).single();
  if (!sub) return json({ error: "Subcategoría no encontrada" }, 404);
  const categoria = (sub.categoria as unknown as { nombre: string }).nombre;

  const { data: archivo, error: errDescarga } = await supabase
    .storage.from("imagenes").download(imagen.storage_path);
  if (errDescarga || !archivo) return json({ error: "No se pudo leer la imagen" }, 500);
  const base64 = encodeBase64(new Uint8Array(await archivo.arrayBuffer()));

  // 3. Registrar la versión del método (si es nueva)
  await supabase.from("metodo_version").upsert(
    { id: VERSION, modelo: MODELO, prompt: PROMPT_SISTEMA, esquema: ESQUEMA },
    { onConflict: "id", ignoreDuplicates: true },
  );

  const base = {
    imagen_id: imagen.id,
    subcategoria_id: sub.id,
    metodo_version: VERSION,
    creado_por: usuario.id,
  };

  // 4. Llamar a Claude con visión y salida JSON con esquema fijo
  let fila: Record<string, unknown>;
  try {
    const respuesta = await anthropic.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      // Si el modelo declina la solicitud, Anthropic la reintenta con otro modelo;
      // el modelo que respondió queda en «modelo_servido».
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        effort: ESFUERZO,
        format: { type: "json_schema", schema: ESQUEMA },
      },
      system: PROMPT_SISTEMA,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: mensajeUsuario(imagen.codigo, categoria, sub.nombre) },
        ],
      }],
    });

    const uso = {
      modelo_servido: respuesta.model,
      tokens_entrada: respuesta.usage.input_tokens,
      tokens_salida: respuesta.usage.output_tokens,
    };

    if (respuesta.stop_reason === "refusal") {
      fila = { ...base, ...uso, estado: "rechazo", error: "El modelo declinó analizar la imagen" };
    } else if (respuesta.stop_reason === "max_tokens") {
      fila = { ...base, ...uso, estado: "error", error: "Respuesta incompleta (max_tokens)" };
    } else {
      const texto = respuesta.content.find((b) => b.type === "text");
      if (!texto || texto.type !== "text") throw new Error("La respuesta no trae JSON");
      const crudo = JSON.parse(texto.text) as Resultado;
      const r = aplicarReglasDuras(crudo);
      fila = {
        ...base, ...uso, estado: "ok",
        descripcion: r.descripcion, ilegible: r.ilegible,
        observabilidad: r.observabilidad, relacionada: r.relacionada,
        motivo: r.motivo, confianza: r.confianza, condiciones: r.condiciones,
        respuesta_cruda: crudo,
      };
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      fila = { ...base, estado: "error", error: "Límite de uso de la API; intente en un minuto" };
    } else if (e instanceof Anthropic.APIError) {
      fila = { ...base, estado: "error", error: `API de Claude (${e.status}): ${e.message}` };
    } else {
      fila = { ...base, estado: "error", error: String(e) };
    }
  }

  // 5. Guardar y devolver el resultado
  const { data: nuevo, error: errInsert } = await supabase
    .from("analisis").insert(fila).select("id").single();
  if (errInsert) return json({ error: `No se pudo guardar: ${errInsert.message}` }, 500);

  const { data: resultado } = await supabase
    .from("v_resultados").select("*").eq("analisis_id", nuevo.id).single();
  return json(resultado);
});
