// Edge Function «analizar-imagen»
// Entrada (POST JSON): { imagen_id: uuid, subcategoria_id: number }
// Salida: la fila de v_resultados del análisis recién creado.
//
// Archivo único: se puede pegar tal cual en el editor del panel de Supabase.
// Secretos: ANTHROPIC_API_KEY (lo configura usted en Supabase).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los entrega Supabase automáticamente.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

// ═══════════════ MÉTODO (versión, modelo, prompt, esquema) ═══════════════
// VERSIÓN DEL MÉTODO = prompt + esquema + modelo.
// Si cambia cualquiera de los tres, suba VERSION (v1.0 → v1.1) y registre el
// cambio en metodo/regla_clasificacion.md. Los análisis anteriores conservan
// la versión con la que se hicieron.

const VERSION = "v1.0";

// Modelo de Claude con visión. Sonnet 5 cuesta US$ 2 / 10 por millón de tokens
// (entrada / salida), 2,5 veces menos que Opus 5. Si la calidad no alcanza,
// pruebe "claude-opus-5"; eso es una versión nueva del método.
const MODELO = "claude-sonnet-5";

// Esfuerzo de razonamiento: "low" | "medium" | "high".
// "low" basta para clasificar y reduce los tokens de salida, que son los más caros.
const ESFUERZO = "low";

const CONDICIONES = [
  "poca_luz",
  "lejano",
  "parcial",
  "multiples_problemas",
  "reparado",
  "baja_resolucion",
] as const;

const PROMPT_SISTEMA = `Usted clasifica fotografías de problemas urbanos reportados por una comunidad, según categorías de la norma ISO 37120. Para cada imagen recibe la categoría y la subcategoría que eligió la persona que la subió, y debe decidir si la imagen está relacionada con esa subcategoría.

Aplique esta regla, en este orden:

1. DESCRIPCIÓN. Describa solo lo que se ve: objetos, su estado, el entorno, la luz. No identifique personas, lugares concretos ni causas. No suponga lo que ocurre fuera del encuadre. Dos a cuatro oraciones.

2. ILEGIBLE. Marque ilegible = true si la imagen no permite ver su contenido (muy oscura, muy borrosa, tapada o vacía). En ese caso relacionada = "no_determinable".

3. OBSERVABILIDAD de la subcategoría en ESTA imagen:
   - "observable": el problema se ve directamente (basura acumulada, un bache, agua servida corriendo, una calle sin alumbrado de noche).
   - "indicio": se ven señales que sugieren el problema pero no lo prueban (una parada sin rampa para "transporte poco accesible", cables caídos para "cortes de luz").
   - "no_observable": el problema no puede verse en una fotografía (delitos, desempleo, deserción escolar, desconfianza institucional, ruido, calidad de la atención).

4. RELACIONADA:
   - "si": lo visible muestra la subcategoría (observable) o hay indicios claros y específicos (indicio).
   - "no": lo visible no tiene relación con la subcategoría, o muestra otra cosa.
   - "no_determinable": la subcategoría es no_observable, o la imagen es ilegible, o lo visible no alcanza para decidir. Si la subcategoría es no_observable, responda "no_determinable" salvo que la imagen contenga evidencia explícita (por ejemplo, un letrero que lo diga).

5. MOTIVO. Una o dos oraciones que nombren el elemento visible concreto que justifica la decisión. Si es no_determinable, diga qué faltaría ver.

6. CONFIANZA: "alta", "media" o "baja". Use "baja" siempre que la decisión dependa de indicios o de detalles poco nítidos.

7. CONDICIONES: marque las que apliquen:
   poca_luz, lejano, parcial, multiples_problemas, reparado, baja_resolucion.
   Lista vacía si ninguna aplica.

Responda en español.`;

const ESQUEMA = {
  type: "object",
  properties: {
    descripcion: { type: "string" },
    ilegible: { type: "boolean" },
    observabilidad: {
      type: "string",
      enum: ["observable", "indicio", "no_observable"],
    },
    relacionada: { type: "string", enum: ["si", "no", "no_determinable"] },
    motivo: { type: "string" },
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    condiciones: {
      type: "array",
      items: { type: "string", enum: [...CONDICIONES] },
    },
  },
  required: [
    "descripcion",
    "ilegible",
    "observabilidad",
    "relacionada",
    "motivo",
    "confianza",
    "condiciones",
  ],
  additionalProperties: false,
} as const;

type Resultado = {
  descripcion: string;
  ilegible: boolean;
  observabilidad: "observable" | "indicio" | "no_observable";
  relacionada: "si" | "no" | "no_determinable";
  motivo: string;
  confianza: "alta" | "media" | "baja";
  condiciones: (typeof CONDICIONES)[number][];
};

function mensajeUsuario(codigo: string, categoria: string, subcategoria: string) {
  return `Imagen ${codigo}.
Categoría ISO 37120: ${categoria}
Subcategoría elegida: ${subcategoria}

Aplique la regla a esta imagen y esta subcategoría.`;
}

// Refuerza en código las reglas 2 y 4, por si el modelo no las cumple:
// ilegible → no_determinable; no_observable → no_determinable salvo un «si»
// (evidencia explícita, p. ej. un letrero).
function aplicarReglasDuras(r: Resultado): Resultado {
  if (r.ilegible) return { ...r, relacionada: "no_determinable" };
  if (r.observabilidad === "no_observable" && r.relacionada === "no") {
    return { ...r, relacionada: "no_determinable" };
  }
  return r;
}

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
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 4000,
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
