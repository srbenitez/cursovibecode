// VERSIÓN DEL MÉTODO = prompt + esquema + modelo.
// Si cambia cualquiera de los tres, suba VERSION (v1.0 → v1.1) y registre el
// cambio en metodo/regla_clasificacion.md. Los análisis anteriores conservan
// la versión con la que se hicieron.

export const VERSION = "v1.0";

// Modelo de Claude con visión. Para bajar el costo por imagen puede usar
// "claude-sonnet-5"; eso es una versión nueva del método.
export const MODELO = "claude-opus-5";

// Esfuerzo de razonamiento: "low" | "medium" | "high".
export const ESFUERZO = "medium";

export const CONDICIONES = [
  "poca_luz",
  "lejano",
  "parcial",
  "multiples_problemas",
  "reparado",
  "baja_resolucion",
] as const;

export const PROMPT_SISTEMA = `Usted clasifica fotografías de problemas urbanos reportados por una comunidad, según categorías de la norma ISO 37120. Para cada imagen recibe la categoría y la subcategoría que eligió la persona que la subió, y debe decidir si la imagen está relacionada con esa subcategoría.

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

export const ESQUEMA = {
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

export type Resultado = {
  descripcion: string;
  ilegible: boolean;
  observabilidad: "observable" | "indicio" | "no_observable";
  relacionada: "si" | "no" | "no_determinable";
  motivo: string;
  confianza: "alta" | "media" | "baja";
  condiciones: (typeof CONDICIONES)[number][];
};

export function mensajeUsuario(codigo: string, categoria: string, subcategoria: string) {
  return `Imagen ${codigo}.
Categoría ISO 37120: ${categoria}
Subcategoría elegida: ${subcategoria}

Aplique la regla a esta imagen y esta subcategoría.`;
}

// Refuerza en código las reglas 2 y 4, por si el modelo no las cumple:
// ilegible → no_determinable; no_observable → no_determinable salvo un «si»
// (evidencia explícita, p. ej. un letrero).
export function aplicarReglasDuras(r: Resultado): Resultado {
  if (r.ilegible) return { ...r, relacionada: "no_determinable" };
  if (r.observabilidad === "no_observable" && r.relacionada === "no") {
    return { ...r, relacionada: "no_determinable" };
  }
  return r;
}
