# Cierre con saldo cancelado

Desde el detalle de un presupuesto confirmado con saldo positivo, elegir
«Cerrar con saldo cancelado». Revisar el importe completo, indicar fecha,
motivo y, opcionalmente, otro presupuesto de la misma obra como reemplazo.

El precio original se conserva. El cierre guarda cuánto se pagó y cuánto
se canceló en la moneda del acuerdo; no crea un pago. El pendiente queda
en cero y el acuerdo figura 100 % resuelto, sin indicar 100 % pagado.
Las cuotas del acuerdo cerrado dejan de generar desembolsos futuros.
El indicador de presupuestos aprobados conserva los montos originales.

El acuerdo cerrado y sus pagos quedan como historial, sin edición, nuevos
pagos, anulación o eliminación de sus pagos. Los comprobantes siguen
disponibles y se pueden agregar. No se cierra automáticamente el presupuesto
reemplazante ni se le trasladan pagos.

El servidor verifica el saldo, cotizaciones, cambios concurrentes, fecha
no futura y que no sea anterior a pagos registrados. La migración 022 debe
aplicarse antes del despliegue; agrega campos sin modificar registros existentes.
