/* ============================================================
   obra493 - migracion 023
   Las listas desplegables se pueden editar: rubro y subrubro.

   POR QUE
   -------
   Rubro y subrubro son las dos unicas listas de la app que son datos y
   no codigo. Todo el resto de los desplegables (moneda, medio de pago,
   periodicidad, estado) son opciones del motor: cambiarles el nombre no
   alcanzaria, habria que cambiar la cuenta que hay detras.

   Hasta hoy a esas dos listas solo se les podia agregar. El resultado es
   el esperable: nombres escritos de apuro, duplicados y un orden que es
   el de creacion. Y como agregar era la unica salida, la lista solo
   crece.

   NO SE BORRA (decision del usuario, 11-oct-2026). Un rubro lo apuntan
   cinco tablas -- material, tarea_tipo, presupuesto, pago y documento --
   y borrar uno con un pago colgado no es limpiar la lista, es romper el
   pago. En su lugar: renombrar, reordenar y ocultar. Ocultar saca el
   rubro de los desplegables sin tocar nada de lo ya cargado, y un rubro
   oculto sigue apareciendo en el registro que lo usa: si no, editar ese
   registro le cambiaria el rubro sin que nadie lo pida.

   Un rubro que no usa nadie se renombra y pasa a ser otro: es la forma
   de aprovechar los que sobran sin perder el historial de los que no.

   Idempotente.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH('dbo.rubro', 'activo') IS NULL
    ALTER TABLE dbo.rubro ADD activo bit NOT NULL CONSTRAINT df_rubro_activo DEFAULT 1;
GO

IF COL_LENGTH('dbo.subrubro', 'activo') IS NULL
    ALTER TABLE dbo.subrubro ADD activo bit NOT NULL CONSTRAINT df_subrubro_activo DEFAULT 1;
GO

/* Verificacion */
SELECT 'rubro'    AS tabla, COUNT(*) AS filas, SUM(CAST(activo AS int)) AS activos FROM dbo.rubro
UNION ALL
SELECT 'subrubro', COUNT(*), SUM(CAST(activo AS int)) FROM dbo.subrubro;
