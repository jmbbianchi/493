/* RESET CONTROLADO DE DATOS DE OBRA
   Ejecutar SOLO sobre dbo de db-obra493, despues de verificar el nombre de
   la base y tener backup. Conserva estructura, biblioteca global e indices.
   Borra obras, usuarios de obra, presupuestos, pagos, documentos y avances.
   No elimina usuario para que la puerta de acceso siga funcionando. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  /* Archivos y relaciones que apuntan a pagos, cuotas o presupuestos. */
  DELETE FROM dbo.documento;
  IF OBJECT_ID('dbo.proyecto_avance','U') IS NOT NULL DELETE FROM dbo.proyecto_avance;
  DELETE FROM dbo.avance_tarea;
  IF OBJECT_ID('dbo.proyecto_dependencia','U') IS NOT NULL DELETE FROM dbo.proyecto_dependencia;
  DELETE FROM dbo.tarea_dependencia;

  /* Relaciones de planificacion y computo. */
  IF OBJECT_ID('dbo.proyecto_presupuesto_tarea','U') IS NOT NULL DELETE FROM dbo.proyecto_presupuesto_tarea;
  IF OBJECT_ID('dbo.proyecto_plan_pago','U') IS NOT NULL DELETE FROM dbo.proyecto_plan_pago;
  IF OBJECT_ID('dbo.proyecto_tarea','U') IS NOT NULL DELETE FROM dbo.proyecto_tarea;
  IF OBJECT_ID('dbo.proyecto_rubro','U') IS NOT NULL DELETE FROM dbo.proyecto_rubro;
  IF OBJECT_ID('dbo.proyecto_revision','U') IS NOT NULL DELETE FROM dbo.proyecto_revision;
  DELETE FROM dbo.computo_material;
  DELETE FROM dbo.computo_coeficiente;
  DELETE FROM dbo.computo;
  DELETE FROM dbo.obra_tarea;
  DELETE FROM dbo.obra_coeficiente;
  DELETE FROM dbo.obra_material;

  /* Dinero y cotizaciones. */
  DELETE FROM dbo.pago;
  DELETE FROM dbo.cuota;
  DELETE FROM dbo.plan_tramo;
  DELETE FROM dbo.presupuesto_item;
  DELETE FROM dbo.presupuesto;

  /* Acceso por obra y obras. Se conservan usuario, rubro, material, indices
     y la biblioteca para que una obra nueva tenga el punto de partida. */
  DELETE FROM dbo.obra_usuario;
  DELETE FROM dbo.obra;

  /* La puerta local necesita un dueño. Si Entra ya está conectado, esta fila
     tampoco se elimina; se resetea solo el acceso a obras, no la identidad. */
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO

/* Controles: todos deben devolver 0, salvo usuario y las bibliotecas/indices. */
SELECT 'obra' tabla, COUNT(*) filas FROM dbo.obra
UNION ALL SELECT 'obra_usuario', COUNT(*) FROM dbo.obra_usuario
UNION ALL SELECT 'computo', COUNT(*) FROM dbo.computo
UNION ALL SELECT 'presupuesto', COUNT(*) FROM dbo.presupuesto
UNION ALL SELECT 'pago', COUNT(*) FROM dbo.pago;

/* Despues ejecutar 014 y 015. Como no quedan obras, ambas crean tablas y no
   importan datos viejos. La primera obra se crea desde la aplicacion. */
