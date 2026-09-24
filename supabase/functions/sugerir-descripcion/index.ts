// Edge Function «sugerir-descripcion» (formulario ciudadano, sin inicio de sesión)
// Entrada (POST JSON): { imagen_base64: string (JPEG), subcategoria_id: number }
// Salida: { sugerencia_id, relacionada, observabilidad, descripcion, motivo,
//           confianza, datos_identificables }
//
// Antes de enviar el formulario, revisa si la foto representa el problema
// elegido y propone una descripción. NO guarda la imagen: solo el resultado.
//
// Archivo único: se puede pegar tal cual en el editor del panel de Supabase.
// Secretos: ANTHROPIC_API_KEY (el mismo de «analizar-imagen»).

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ═══════════════ MÉTODO ═══════════════
const VERSION = "f1.0";
const MODELO = "claude-sonnet-5";
const ESFUERZO = "low";

// Límites contra abusos (la función es pública)
const MAX_POR_IP_POR_HORA = 20;
const MAX_TOTAL_POR_DIA = 500;
const MAX_BASE64 = 3_000_000; // ~2,2 MB de imagen

const PROMPT_SISTEMA = `Usted ayuda a ciudadanos que reportan problemas de su comunidad (categorías ISO 37120). La persona eligió una categoría y una subcategoría, y adjuntó una fotografía. Antes de que envíe el formulario, usted revisa la foto.

Reglas:
1. Describa solo lo que se ve. No identifique personas, lugares concretos ni causas. No suponga lo que ocurre fuera del encuadre.
2. OBSERVABILIDAD de la subcategoría en esta foto: "observable" (el problema se ve directamente), "indicio" (hay señales que lo sugieren sin probarlo) o "no_observable" (no puede verse en una fotografía: delitos, desempleo, ruido, calidad de la atención, etc.).
3. RELACIONADA: "si" si la foto muestra el problema o indicios claros; "no" si muestra otra cosa; "no_determinable" si la subcategoría no es observable, la foto es ilegible o no alcanza para decidir.
4. DESCRIPCION: una propuesta de descripción del problema para el formulario, en primera persona del ciudadano y en tono sencillo, basada solo en lo visible. Máximo 280 caracteres. Si relacionada = "no", describa brevemente lo que sí muestra la foto.
5. MOTIVO: una oración dirigida al ciudadano que explique la decisión, nombrando el elemento visible. Si es "no", sugiera qué foto serviría mejor.
6. DATOS_IDENTIFICABLES: true si se ven rostros reconocibles, placas de vehículos, números de casa, nombres o documentos.
7. CONFIANZA: "alta", "media" o "baja".

Responda en español, con trato de usted.`;

const ESQUEMA = {
  type: "object",
  properties: {
    descripcion: { type: "string" },
    observabilidad: { type: "string", enum: ["observable", "indicio", "no_observable"] },
    relacionada: { type: "string", enum: ["si", "no", "no_determinable"] },
    motivo: { type: "string" },
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    datos_identificables: { type: "boolean" },
  },
  required: ["descripcion", "observabilidad", "relacionada", "motivo", "confianza", "datos_identificables"],
  additionalProperties: false,
} as const;

type Resultado = {
  descripcion: string;
  observabilidad: "observable" | "indicio" | "no_observable";
  relacionada: "si" | "no" | "no_determinable";
  motivo: string;
  confianza: "alta" | "media" | "baja";
  datos_identificables: boolean;
};

// ═══════════════ FUNCIÓN ═══════════════
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

async function huellaIp(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "desconocida";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("iso37120:" + ip));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let imagen: string, subcategoriaId: number;
  try {
    ({ imagen_base64: imagen, subcategoria_id: subcategoriaId } = await req.json());
    if (typeof imagen !== "string" || !imagen || !Number.isInteger(subcategoriaId)) throw new Error();
  } catch {
    return json({ error: "Se requieren imagen_base64 y subcategoria_id" }, 400);
  }
  if (imagen.length > MAX_BASE64) return json({ error: "La imagen es demasiado grande" }, 413);
  if (!imagen.startsWith("/9j/")) return json({ error: "La imagen debe ser JPEG" }, 415);

  // Límites de uso
  const ipHash = await huellaIp(req);
  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const haceUnDia = new Date(Date.now() - 86400_000).toISOString();
  const [{ count: usoIp }, { count: usoTotal }] = await Promise.all([
    supabase.from("sugerencia_ia").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).gte("creado_en", haceUnaHora),
    supabase.from("sugerencia_ia").select("id", { count: "exact", head: true })
      .gte("creado_en", haceUnDia),
  ]);
  if ((usoIp ?? 0) >= MAX_POR_IP_POR_HORA || (usoTotal ?? 0) >= MAX_TOTAL_POR_DIA) {
    return json({ error: "Se alcanzó el límite de revisiones automáticas. Puede enviar el reporte sin la sugerencia." }, 429);
  }

  const { data: sub } = await supabase
    .from("subcategoria").select("id, nombre, categoria(nombre)").eq("id", subcategoriaId).single();
  if (!sub) return json({ error: "Subcategoría no encontrada" }, 404);
  const categoria = (sub.categoria as unknown as { nombre: string }).nombre;

  const base = { ip_hash: ipHash, subcategoria_id: sub.id, modelo: MODELO, metodo_version: VERSION };
  let fila: Record<string, unknown>;
  let resultado: Resultado | null = null;

  try {
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: ESFUERZO, format: { type: "json_schema", schema: ESQUEMA } },
      system: PROMPT_SISTEMA,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imagen } },
          { type: "text", text: `Categoría: ${categoria}\nSubcategoría elegida: ${sub.nombre}\n\nRevise la foto según las reglas.` },
        ],
      }],
    });
    const uso = {
      modelo: respuesta.model,
      tokens_entrada: respuesta.usage.input_tokens,
      tokens_salida: respuesta.usage.output_tokens,
    };
    if (respuesta.stop_reason === "refusal") {
      fila = { ...base, ...uso, estado: "rechazo", error: "El modelo declinó revisar la imagen" };
    } else {
      const texto = respuesta.content.find((b) => b.type === "text");
      if (!texto || texto.type !== "text") throw new Error("La respuesta no trae JSON");
      resultado = JSON.parse(texto.text) as Resultado;
      if (resultado.observabilidad === "no_observable" && resultado.relacionada === "no") {
        resultado.relacionada = "no_determinable";
      }
      resultado.descripcion = resultado.descripcion.slice(0, 300);
      fila = { ...base, ...uso, estado: "ok", ...resultado };
    }
  } catch (e) {
    const mensaje = e instanceof Anthropic.APIError ? `API de Claude (${e.status})` : String(e);
    fila = { ...base, estado: "error", error: mensaje };
  }

  const { data: guardada } = await supabase.from("sugerencia_ia").insert(fila).select("id").single();

  if (!resultado) {
    return json({ error: "No fue posible revisar la imagen ahora. Puede continuar sin la sugerencia." }, 502);
  }
  return json({ sugerencia_id: guardada?.id ?? null, ...resultado });
});
