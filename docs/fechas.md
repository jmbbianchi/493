# Fechas y horas

La zona de negocio es `America/Argentina/Buenos_Aires`, independientemente
de la ubicación del dispositivo o servidor. Usar `hoyArgentina()` en el
frontend y `hoy_argentina()` en Python para obtener la fecha actual.

Las fechas visibles se presentan como DD/MM/AAAA. Los timestamps visibles
usan DD/MM/AAAA HH:mm:ss en Buenos Aires (24 horas). Los períodos que sólo
identifican un mes se muestran como MM/AAAA.

Las fechas civiles de pagos y cuotas se transportan en ISO YYYY-MM-DD y no
se desplazan de zona. Los timestamps de auditoría SQL se almacenan en UTC;
el formateador reconoce los valores sin sufijo de datetime2 como UTC y
convierte al mostrarlos. No cambiar fechas históricas para darles formato.

Las firmas de Azure Storage conservan UTC, como requiere ese protocolo.
