# Guía 02 · Análisis de imágenes de investigación con IA

(English title: AI research image analysis)

IA DENTRO DEL MÉTODO — parte del procedimiento de investigación

## Problema

Contar objetos en decenas de imágenes de campo o laboratorio consume horas, y dos personas rara vez cuentan lo mismo.

## Herramienta

Un prototipo de conteo con una regla explícita puede hacer el primer pase y señalar las imágenes dudosas; usted conserva la decisión. Vamos a construirlo.

## Primer resultado

Podrá crear un prototipo que cuente objetos visibles de una categoría definida y muestre dónde discrepa de las etiquetas humanas.

## Para comenzar

Puede reunir 20 imágenes propias o públicas con licencia adecuada de círculos de papel de colores, con superposiciones, escenas vacías, desenfoque y cambios de iluminación. Los permisos e identificadores quedan registrados.

## Lecciones relacionadas

- R1.3 · Solicitudes para IA y uso responsable
- R2.4 · Ética y reproducibilidad
- R3.1 · Describir, generar, probar y mejorar
- R3.5 · Exactitud y pruebas de casos límite
- R5.3 · Método y mantenimiento

## Proceso paso a paso

1. La regla propuesta es contar un círculo parcialmente visible solo cuando aparece su centro. Quedan excluidas propiedades que la imagen no revela, como resistencia del material o defectos ocultos.
2. Puede preparar una referencia humana con identificador, conteo esperado, condición difícil y notas. Un colega puede etiquetar varias imágenes independientemente; las discrepancias se concilian antes de probar.
3. Para desarrollar las instrucciones o el método se usan 12 imágenes; ocho imágenes etiquetadas quedan reservadas para una prueba independiente. Las fotografías casi idénticas deben permanecer en el mismo grupo.
4. La interfaz puede mostrar imagen, conteo propuesto y advertencia visible ante imágenes ilegibles. Debe conservar la versión del método y el resultado de cada imagen.
5. Con el método definido, puede ejecutar la prueba reservada y comparar cada predicción con la referencia. El informe presenta errores por iluminación, superposición y desenfoque, con ejemplos anotados.

## Su primera solicitud a la IA

Con los insumos listos, esta es la solicitud que inicia el paso 1. Complete los campos entre corchetes y péguela en Claude.

```text
Quisiera un prototipo pequeño para contar [objeto] en imágenes de [entorno], con esta regla: [regla]. Debe mostrar imagen cargada, conteo propuesto y advertencia ante entradas ilegibles, conservando los identificadores. Necesito una comparación con etiquetas humanas y ejemplos de conteos incorrectos. No corresponde inferir propiedades que la imagen no permite observar.
```

## La red de trabajo que crea la solicitud

- Usted prepara: Imágenes de ejemplo con identificador; Regla de conteo escrita; Etiquetas humanas
- La IA asume estos roles: Contador de objetos en imágenes; Detector de entradas ilegibles
- Usted recibe: Conteo propuesto por imagen; Comparación con etiquetas humanas; Ejemplos de conteos incorrectos
- Reglas escritas en la solicitud: Conserva los identificadores; No infiere lo que la imagen no muestra
- Comprobación: Ocho imágenes comparadas; dos errores anotados con explicación

## Comprobación

Una imagen vacía debe producir cero, sin inventar objetos. Un archivo borroso o incompatible debe generar una advertencia clara. El informe debe incluir coincidencias exactas y errores absolutos en las ocho imágenes reservadas, incluidos los fallos.

## Siguiente paso

El paso a imágenes de investigación autorizadas requiere revisar permisos y consistencia del etiquetado. Nuevas categorías, cámaras o entornos requieren pruebas adicionales; una demostración correcta con círculos de papel no valida un método científico de análisis de imágenes.

## Para el acompañamiento

permisos, regla de conteo, imágenes etiquetadas, división de datos, prototipo, resultados de las ocho imágenes y dos errores anotados con posibles explicaciones.
