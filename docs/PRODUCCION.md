# Publicación de la versión actual

## Base de datos

En Azure SQL Query Editor ejecutar una sola vez `db/017_financiacion.sql` sobre `db-obra493`. No volver a ejecutar las migraciones anteriores ni `016_reset_datos.sql` salvo que se quiera borrar toda la información de las obras.

## GitHub

Desde `D:\Claude\Projects\493`, con cualquier proceso que esté usando Git cerrado:

```powershell
git add backend db frontend/src/App.jsx
git commit -m "completa modulos de obra y financiacion"
git push origin main
```

El push dispara los workflows `backend` y `frontend`. Se debe esperar que ambos terminen en verde antes de probar la URL pública.

## Verificación

- API: `https://obra493-backend.icyglacier-8aa003c9.brazilsouth.azurecontainerapps.io/health`
- Frontend: `https://proud-cliff-0e19abc0f.7.azurestaticapps.net`
- En el frontend probar Proyecto, Gastos y compras, Presupuestos, Calculadora, Documentación y Financiación.
- En Financiación guardar una proyección y volver a entrar para comprobar que los parámetros persisten.
