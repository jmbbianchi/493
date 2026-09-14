# Control de gastos

La vista semanal muestra lo que resta desembolsar, agrupado por tipo y rubro. La barra superior resume esta semana (incluidos vencidos), las dos siguientes, pendiente general, pagos acumulados y pagos por m² cubierto de la obra. El selector ARS/USD afecta toda esta vista; la lista de pagos inferior conserva su moneda original.

- Los pagos efectivos usan el dólar minorista publicado en su fecha o el último anterior. Los pendientes usan la última cotización hasta hoy. La interfaz informa la fecha usada. Sin una cotización necesaria, el total se muestra incompleto, nunca como cero.
- Las cuotas impagas usan su proyección disponible. Las cuotas con pagos parciales muestran el saldo nominal restante, de acuerdo con el criterio del calendario anterior. La fecha de tesorería no cambia el ajuste pactado.
- Las cuotas vencidas con saldo se acumulan en la semana actual. Las pagadas conservan su fecha original. Los pagos reales siempre conservan su fecha efectiva.
- La columna Sin programar no se asigna automáticamente a ninguna semana. El total general incluye esa columna y compromisos fuera del período visible.
- Un pago futuro asociado a un presupuesto no duplica sus cuotas. Un pago futuro sin presupuesto se incluye como desembolso pendiente; se edita desde el registro de pago.
- La vista por rubro compara gasto acumulado, saldo y su suma, incluyendo pagos sin presupuesto. El porcentaje corresponde a esa suma en la moneda seleccionada.

## Reprogramación

Abrir un importe y elegir una fecha, Semana siguiente o Sin fecha; luego Guardar fecha. Se actualiza solamente `cuota_calendario`, con control de versión. Se conservan el presupuesto, sus cuotas, la prioridad original de imputación y todos los pagos. Si otra sesión modifica la programación, se pide recargar.

## Despliegue

Antes de publicar el backend ejecutar `backend/migrate_calendar.py` con `SQL_CONNECTION_STRING` del entorno. La migración es aditiva e idempotente: crea `dbo.cuota_calendario`. No modifica datos financieros existentes. Publicar primero el backend y después el frontend.

Verificación: pruebas de tesorería en `frontend/tests/tesoreria.test.mjs`, autorización por obra y versiones en `backend/tests/test_calendario.py`, build Vite y comprobación del navegador a escritorio y móvil. Ante errores del calendario, restaurar la imagen y frontend anteriores; dejar la tabla aditiva preserva las fechas programadas.
