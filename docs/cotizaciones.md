# Cotizaciones históricas

Desde/Hasta filtran el período completo; la tabla se pagina de a 100 filas y el gráfico utiliza todos los registros. La selección de variables se comparte entre tabla y gráfico. Día/Semana/Mes/Año muestran el último dato disponible de cada intervalo, con su fecha original en el detalle. No se promedian cotizaciones ni se suman tasas.

Compra y venta del dólar oficial se importan desde ArgentinaDatos / DolarAPI y llevan códigos propios. El promedio vendedor minorista del BCRA se conserva como otra serie; las conversiones de pagos existentes siguen usando ese promedio. La fuente aparece en pantalla. UVA, IPC mensual e interanual provienen del job del BCRA; el nivel encadenado tiene base arbitraria.

Las variables en ARS, porcentajes e índices se grafican con escalas separadas sobre las mismas fechas. Base 100 permite comparar variaciones desde el primer dato de cada serie; no normaliza una serie cuya base es cero.

El IPC del período y el del año componen los cierres mensuales. Un hueco intermedio o la falta del primer mes requerido se indica como dato incompleto. Se informa hasta qué mes hay cierre; no se inventa un valor para meses todavía no publicados. Las fechas de IPC son meses de referencia, no fechas de publicación.

El job diario sincroniza las series nuevas de compra/venta. La primera carga incorpora el histórico; las siguientes actualizan los últimos 30 días. Las escrituras se agrupan en lotes de 500 filas. No se necesita migración de esquema.
