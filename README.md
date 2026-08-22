# 493

Cómputo, presupuesto y avance de obra. Empieza siendo la herramienta para
construir la casa de la calle 493; el modelo de datos está pensado multiobra
desde el principio.

## Estructura

```
backend/     API FastAPI + job de índices (Container App en Azure)
frontend/    SPA React + Vite (Azure Static Web App)
db/          migraciones SQL, en orden
.github/     workflows de deploy
```

## Documentos de diseño

| | |
|---|---|
| Especificación funcional | motor de cálculo, modelo de datos, 7 módulos |
| Plano de infraestructura | Azure: aislamiento, costos, script de creación |
| Memoria descriptiva | qué clase de app es y qué recursos precisa |
| `README-infra.md` | operación: secrets, costos, rollback |

## Arranque

```powershell
# 1. infraestructura (idempotente, ~6 min)
.\deploy-obra493.ps1

# 2. schema inicial
#    Azure Portal -> sql-obra493 -> db-obra493 -> Query editor
#    pegar db/001_init.sql

# 3. secrets del repo (ver README-infra.md secciones 2 y 3.bis)

# 4. push
git push origin main
```

## Desarrollo local

No hace falta tocar Azure para trabajar. Un comando levanta la app entera:

```powershell
docker compose -f docker-compose.dev.yml up
```

| | |
|---|---|
| API | http://localhost:8000/docs |
| SQL | `localhost,1433` — usuario `sa`, password `Obra493$Local` |
| Blobs | http://localhost:10000 (Azurite) |

El frontend va aparte, con hot reload:

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Vite proxea `/api` a `localhost:8000`, así que el front local pega contra el
backend local sin configurar nada.

La única diferencia con producción es que la base es SQL Server 2022 Developer
en vez de Azure SQL: mismo dialecto T-SQL, misma sintaxis, costo cero. Lo que
**no** se reproduce localmente es el auto-pause de serverless — eso hay que
verificarlo igual en Azure.

### Herramientas

| Para | Usar |
|---|---|
| Editor, SQL, Docker, Azure | **VS Code** + extensiones `ms-mssql.mssql`, `ms-azuretools.vscode-docker`, `ms-python.python` |
| Correr los contenedores | **Docker Desktop** |
| Consultar la base | La extensión **MSSQL** de VS Code. *No instalar Azure Data Studio: se retiró el 28-feb-2026.* |
| Probar el API | El Swagger en `/docs`, o **Bruno** si querés colecciones versionadas en el repo |

## Reglas que no se negocian

Salen de la auditoría de junio 2026 que bajó la factura de Azure de u$d 145 a
u$d 43 al mes. Están explicadas en `README-infra.md`, sección 5.

1. **Nada puede impedir el escalado a cero.** Sin pollers, sin SSE con
   keep-alive, sin websockets ociosos, sin scheduler embebido en el proceso web.
2. **Sin pool de conexiones a SQL.** La base es serverless con auto-pause: una
   sesión abierta la mantiene despierta y quema los 100.000 vCore-segundos
   gratis del mes. Ver el comentario en `backend/app/db.py`.
3. **Imagen magra.** Si aparece `pandas`, `openai`, `litellm` o `boto3` en
   `requirements.txt`, se coló algo que no se usa.
