# Gestor de obras civiles

Definición funcional actualizada el 12 de septiembre de 2026 a partir de la
conversación con el dueño del producto. Prevalece sobre GOAL.md y PLAN.md en
objetivos y alcance funcional. Las restricciones operativas existentes siguen
vigentes salvo indicación expresa del usuario.

## Objetivo y usuarios

Gestionar proyectos completos de obra civil: planificación, contrataciones,
compras, ejecución, documentación y fondos. Probar el producto durante la obra
propia y, luego, comercializarlo para arquitectos, ingenieros y propietarios
que gestionen sus proyectos.

El proyecto organiza la aplicación. La calculadora de materiales es auxiliar.
El archivo Excel original no define la estructura del producto.

## Estructura confirmada

Obra → rubros → tareas y subtareas. Ejemplo confirmado: Estructura contiene
Encofrado, Armado y Hormigonado, con fechas y responsables. Un presupuesto de
cementista puede cubrir varias tareas; una tarea puede requerir varios
presupuestos de servicios y materiales.

Las tareas deben poder crearse y planificarse sin cómputo ni presupuesto.
Rubro, responsable y proveedor tienen funciones distintas.

## Las seis secciones

| Sección | Alcance solicitado |
|---|---|
| Proyecto | Gantt editable tipo MS Project, tareas, subtareas, plazos, dependencias, responsables y avance. Agrupación por rubro o responsable. Calendario de gastos previstos basado en los presupuestos vinculados a tareas. |
| Gastos y compras | Gastos por rubro y presupuesto, pagos, compras de materiales, acumulados, estimaciones, proyecciones y KPI como costo por m². |
| Presupuestos | Alternativas por rubro, selección de presupuestos, materiales y servicios, condiciones variables de pago y seguimiento de cumplimiento. |
| Calculadora de materiales | Materialidades, cantidades de obra, consumos unitarios editables y precios con actualización manual. Cantidades consolidadas y costo orientativo. |
| Documentación y parámetros | Superficies, ubicación, servicios y datos básicos. Planos, fotos, carpeta técnica y documentación consultable desde la app. |
| Financiación | Condiciones de préstamos, desembolsos, inicio de pagos, cuotas, intereses y escenarios de adelantos. Usar el préstamo real del usuario como caso de validación. |

## Relaciones y comportamiento esperado

- Planificar trabajo, contratar, comprar, recibir y pagar son hechos distintos.
- Los contratos de servicios se cumplen mediante trabajo; las compras de
  materiales pueden recibirse parcialmente aunque se hayan pagado completas.
- El calendario financiero reúne compromisos de obra y cuotas del préstamo;
  las entradas incluyen aportes propios y desembolsos de financiación.
- Los pagos reales conservan su historia cuando cambia una planificación.
- Un presupuesto vinculado a varias tareas se cuenta una sola vez en el total
  de obra. La distribución entre tareas requiere una regla explícita.
- Deben distinguirse montos estimados, contratados, vencidos y pagados.

### Ejemplos aportados por el usuario

1. Cementista: 20 % antes de iniciar el trabajo y 80 % en pagos semanales
   durante la duración del trabajo contratado.
2. Cemento: pago del 100 % por adelantado.
3. Pared de ladrillo hueco del 18: ingresar m² y consumos por m² de arena,
   cemento y ladrillos para calcular las cantidades necesarias.

## Monedas, unidades e índices

Permitir análisis en pesos, dólares, UVA y mediante IPC. Separar la moneda o
unidad del acuerdo, su mecanismo de ajuste y la unidad de visualización.
IPC es un índice: expresarlo como ajuste o pesos constantes con mes base.
Conservar fecha, fuente y valor de cada referencia utilizada. Distinguir
valores publicados de supuestos futuros y señalar los datos faltantes.

La integración existente de índices es candidata a reutilizar. Su cobertura
y funcionamiento actual todavía deben verificarse.

## Diagnóstico inicial del repositorio

Inspección estática; no constituye verificación de producción.

| Hallazgo | Evidencia | Consecuencia |
|---|---|---|
| El cronograma depende del cómputo | db/012_cronograma.sql agrega fechas a computo; avances y dependencias referencian computo | Crear una entidad de tarea de proyecto independiente y preparar la migración de los vínculos existentes. |
| Hay base para presupuestos y pagos | db/006_presupuestos.sql y db/007_pagos.sql | Evaluar reutilización, incorporando vínculos con tareas y condiciones relativas a su programación. |
| Hay documentación y almacenamiento | db/011_documentos.sql y backend/app/routers/documentos.py | Evaluar ampliación a repositorio de obra y vínculos con tareas. |
| Hay calculadora separable | Pantallas de cómputo, materiales y rendimientos | Conservar como módulo auxiliar sin convertir sus filas en el cronograma obligatorio. |
| El plan anterior mezcla estados históricos | docs/PLAN.md describe como inexistentes funciones también marcadas como hechas | No usar esas declaraciones como prueba del estado actual. |

## Secuencia propuesta de reescritura

Estado del primer bloque: implementación local de tareas independientes,
Gantt y avance disponible; migración y validación en SQL Server pendientes.
Ver [alcance, pruebas y activación](PROYECTO-IMPLEMENTACION.md).

Esta secuencia es una propuesta técnica, no una afirmación de implementación.

1. Diseñar la pantalla Proyecto y el modelo de tareas independientes. Caso
   verificable: crear el rubro Estructura con tareas, subtareas, responsables,
   fechas y dependencias sin cargar materiales.
2. Implementar el cronograma editable y registro histórico de avance. Validar
   cambios de fechas, dependencias, ciclos, jerarquía y aislamiento por obra.
3. Vincular presupuestos y planes de pago a tareas. Validar el cementista y
   la compra anticipada de cemento, sin duplicar totales.
4. Integrar gastos, compras, cumplimiento y calendario de fondos. Mostrar
   compromisos, pagos reales, entradas y necesidad de fondos por período.
5. Completar parámetros y repositorio documental; reorganizar la calculadora.
6. Implementar financiación con las condiciones reales del préstamo y casos
   contrastados con documentación bancaria.
7. Validar en la obra propia y completar identidad, permisos y condiciones
   operativas necesarias antes de ofrecer el producto a terceros.

Antes de migrar datos: inventariar lo existente, definir correspondencias,
respaldo y recuperación. No eliminar el histórico para adaptar el modelo.

## Decisiones todavía abiertas

- Alcance concreto de “tipo MS Project”: calendario laboral, feriados, tipos
  de dependencia, hitos, línea base y camino crítico.
- Reprogramación de pagos vinculados a tareas: qué fechas se desplazan y
  cuáles son compromisos contractuales fijos.
- Reparto de importes entre tareas y ponderación del avance agregado.
- Disponibilidad inicial, cuentas, aportantes y transferencias internas.
- Referencia de dólar y supuestos editables para escenarios futuros.
- Condiciones exactas del préstamo, seguros, cargos y reglas de precancelación.
- Experiencia visual y requisitos de uso en escritorio y teléfono.

Resolver cada punto al diseñar su módulo; no adoptar como confirmadas las
suposiciones del plan anterior.
