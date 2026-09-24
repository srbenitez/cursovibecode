# Regla de clasificación · v1.0

**Fecha:** 2026-09-24 · **Modelo:** `claude-sonnet-5` · **Esfuerzo:** `low` · **Imagen:** JPEG, lado mayor 1568 px

La fuente de verdad es `supabase/functions/analizar-imagen/index.ts` (sección MÉTODO, al inicio del archivo). Este archivo la explica en lenguaje humano. Si cambia el prompt, el esquema, el modelo o el tamaño de imagen, suba la versión en los dos lugares y anote el motivo abajo.

## Qué recibe el modelo
La imagen, su código (`IMG-0001`), la categoría ISO 37120 y la subcategoría que eligió la persona.

## Qué devuelve (esquema fijo)

| Campo | Valores | Regla |
|---|---|---|
| `descripcion` | texto | Solo lo visible. Sin personas, lugares concretos ni causas. |
| `ilegible` | sí / no | Muy oscura, borrosa, tapada o vacía → `relacionada = no_determinable`. |
| `observabilidad` | `observable` · `indicio` · `no_observable` | ¿La subcategoría puede verse en *esta* imagen? |
| `relacionada` | `si` · `no` · `no_determinable` | `no_observable` → `no_determinable`, salvo evidencia explícita (p. ej., un letrero). |
| `motivo` | texto | El elemento visible concreto que justifica la decisión. |
| `confianza` | `alta` · `media` · `baja` | Declaración del modelo, no una probabilidad. Sirve para ordenar la revisión. |
| `condiciones` | `poca_luz`, `lejano`, `parcial`, `multiples_problemas`, `reparado`, `baja_resolucion` | Condiciones difíciles; se muestran como advertencia. |

Las reglas de `ilegible` y `no_observable` también se aplican en código después de la respuesta, por si el modelo no las cumple.

## Qué no se le pide al modelo
Nada que la foto no muestre: si hay delitos, desempleo, calidad de la atención, ruido o intención de las personas. Para esas subcategorías, la respuesta esperada es `no_determinable`.

## Revisión humana
Cada resultado se marca **✓ correcto** o **✗ incorrecto** con el valor correcto. La revisión guarda quién la hizo y cuándo. Una revisión nueva no borra la anterior.

## Registro de cambios
| Versión | Fecha | Cambio | Motivo |
|---|---|---|---|
| v1.0 | 2026-09-24 | Versión inicial | — |
