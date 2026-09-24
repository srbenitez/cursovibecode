# Clasificador de imágenes de problemas comunitarios (ISO 37120)

Prototipo de la **Guía 02 · Nivel 3** del curso Vibe Coding CEDIA 2026. Usted elige categoría y subcategoría y sube una imagen. Claude con visión devuelve si la imagen está **relacionada** (`si` / `no` / `no_determinable`), la **observabilidad**, una **descripción** de lo visible, el **motivo** y la **confianza**. Después usted marca cada resultado como **✓ correcto** o **✗ incorrecto**.

```
docs/                          página web (GitHub Pages)
  index.html                   analizar una imagen
  revision.html                historial y revisión (pendientes primero)
  js/config.js                 URL y clave pública de Supabase  ← editar
supabase/
  migrations/                  esquema, seguridad (RLS), bucket y catálogo ISO 37120
  functions/analizar-imagen/   Edge Function que llama a Claude
    metodo.ts                  prompt + esquema + modelo = versión del método
metodo/regla_clasificacion.md  la regla explicada, con registro de cambios
```

## Puesta en marcha

Siga **[PASO_A_PASO.md](PASO_A_PASO.md)**: explica cada clic y cada comando, desde crear las cuentas hasta la primera prueba.

## Probar
1. Ingrese con su correo y contraseña.
2. Elija, por ejemplo, *Aguas residuales → Falta de alcantarillado*, suba una foto y envíe.
3. Revise el resultado con ✓ o ✗. En *Historial y revisión* verá los pendientes, con los de confianza baja primero.

| Prueba | Resultado esperado |
|---|---|
| Foto de basura acumulada con *Residuos sólidos → Acumulación de basura* | `si`, `observable` |
| La misma foto con *Transporte → Falta de ciclovías* | `no` |
| Cualquier foto con *Seguridad → Delitos violentos* | `no_determinable`, `no_observable` |
| Foto muy oscura o borrosa | advertencia «Imagen ilegible», `no_determinable` |
| Subir dos veces la misma foto | no se duplica; se crea un análisis nuevo |
| Marcar ✗ sin cambiar ningún valor | la app pide cambiar al menos uno |

## Costo aproximado
El método usa `claude-sonnet-5` con esfuerzo `low` (US$ 2 por millón de tokens de entrada y US$ 10 por millón de salida). Calculo **alrededor de US$ 0,01 a 0,02 por imagen**: unas 100 imágenes por US$ 1 a 2. Es una estimación; el costo real de cada análisis se puede consultar con la receta del paso 18 de PASO_A_PASO.md. Si la calidad no alcanza, cambie `MODELO` en `metodo.ts` a `claude-opus-5`, que cuesta unas 2,5 veces más, y suba la versión del método.

## Seguridad
- La API key de Anthropic existe solo como secreto de la Edge Function.
- Todas las tablas tienen RLS. Sin sesión iniciada no se lee ni se escribe nada, y el navegador no puede escribir análisis: solo lo hace la función.
- El bucket `imagenes` es privado. La página muestra las fotos con URL firmadas que vencen en una hora.
- El navegador reduce la imagen a 1568 px y la vuelve a codificar, lo que elimina los metadatos EXIF, incluida la ubicación GPS.
