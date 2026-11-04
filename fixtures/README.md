# Fixtures

- `lcd-7023-catalogo.json`: catálogo del plan LCD 7023 (UCA Rosario), 50 materias con 88 correlativas y la regla "para cursar 4° año, todo 2° año aprobado". Es información pública del plan, sin datos personales. Es la fuente del seed de Supabase.
- `caso-prueba-legacy.json`: **alumno inventado** en el formato de respaldo v2 de "Mi Plan de Estudio". No tiene datos de personas reales. Se generó a propósito para cubrir estos casos:
  - aplazos (GMA1234 con 2, GCO0406 con 3), después aprobadas;
  - ausente a un final (GCO0119);
  - cursada desaprobada y recursada (GMA0230);
  - seminarios promocionados;
  - finales pendientes: uno que se puede rendir (GMA0212) y otro que no, por correlativa (GES0315);
  - pendiente que se puede cursar (GES0314, GWA6803) y otra bloqueada por correlativa (GMA0322);
  - 4° año bloqueado por la regla de 2° año completo (falta GMA0212);
  - materias en curso.
- `caso-prueba-esperado.json`: resultados calculados con la **lógica original** de la app de referencia (`app.js`: `notasDe`, `promedio`, `cumple`, `reqStatus`) sobre el caso de prueba. El core nuevo tiene que dar exactamente esto.

En el respaldo, el `id` de cada materia coincide con su `codigo` del SIU. Las correlativas referencian códigos.

No modificar los fixtures para que "pasen" los tests: si algo no coincide, el que está mal es el código (o hay que consultarlo con Agu).
