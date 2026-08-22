# obra493 — infraestructura

Todo vive en **`rg-obra493`** (Brazil South), suscripción `b94b4687-…`.
Ningún recurso de Quebracho Blanco, FinArg ni el Facturador se toca ni se comparte.

---

## 1 · Crear todo

```powershell
.\deploy-obra493.ps1
```

Idempotente: se puede correr las veces que haga falta. Al final imprime las URLs.
La password de SQL se genera una vez y queda en `%USERPROFILE%\.obra493\sqlpwd.txt`
— **fuera del repo**, y el script la reutiliza en las siguientes corridas.

## 2 · Secrets de GitHub

| Secret | De dónde sale |
|---|---|
| `AZURE_SWA_TOKEN` | `az staticwebapp secrets list -g rg-obra493 -n swa-obra493 --query properties.apiKey -o tsv` |
| `AZURE_CLIENT_ID` | del app registration federado (abajo) |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `b94b4687-9cb9-4472-aab2-c4f2b847e79c` |

`GITHUB_TOKEN` no hay que crearlo: lo inyecta Actions solo, y con
`permissions: packages: write` alcanza para pushear a GHCR.

Login federado (OIDC, sin password que rote):

```powershell
$APPID = az ad app create --display-name "gh-obra493" --query appId -o tsv
az ad sp create --id $APPID
az role assignment create --assignee $APPID --role Contributor `
  --scope "/subscriptions/b94b4687-9cb9-4472-aab2-c4f2b847e79c/resourceGroups/rg-obra493"
az ad app federated-credential create --id $APPID --parameters '{
  "name":"gh-main",
  "issuer":"https://token.actions.githubusercontent.com",
  "subject":"repo:jmbbianchi/493:ref:refs/heads/main",
  "audiences":["api://AzureADTokenExchange"]}'
Write-Host "AZURE_CLIENT_ID = $APPID"
```

El rol `Contributor` está acotado al resource group, no a la suscripción.

## 3 · Costos esperados

| Recurso | Configuración | u$d/mes | Qué lo haría subir |
|---|---|---|---|
| Azure SQL `db-obra493` | GP serverless 0.5–2 vCore, **free limit ON**, auto-pause 15 min | **0,00** | Que la base no pause. 100.000 vCore-seg ÷ 0,5 vCore = **55 h online/mes**. Un pool de conexiones abierto la deja despierta y quema la cuota en dos días. |
| Container App `obra493-backend` | 0,5 vCPU / 1 Gi, min-replicas **0** | **0,00 – 3,50** | El free grant de Container Apps (180.000 vCPU-seg) es **por suscripción** y lo comparten el Facturador y FinArg. Si ya está agotado, esto pasa a facturar desde el primer segundo. Y si alguna vez ponés `min-replicas 1`, son ~u$d 11/mes fijos. |
| Container Apps Job `obra493-indices` | 0,25 vCPU, 30 s/día | **0,00 – 0,10** | Que el job se cuelgue. Por eso tiene `--replica-timeout 300`. |
| Static Web App `swa-obra493` | plan Free | **0,00** | Pasar de 100 GB de banda al mes. Con este uso, imposible. |
| Log Analytics `law-obra493` | 30 días, tope 0,1 GB/día | **0,00 – 1,50** | Logs verbosos. El tope diario lo corta. |
| Storage `stobra493` | Standard LRS Hot | **0,10 – 0,90** | Fotos de obra sin comprimir. A los 90 días conviene una regla de lifecycle a Cool. |
| Container Apps env `cae-obra493` | Consumption | **0,00** | Solo si alguien le agrega un workload profile Dedicated. |
| Resource group + Budget | — | **0,00** | — |
| | **Total** | **0,10 – 6,00** | |

**El único que puede descontrolarse es el SQL**, y no por volumen de datos sino
por conexiones abiertas. `backend/app/db.py` usa conexión efímera por operación
justamente para eso; está comentado en el archivo.

### Qué vigilar, en orden

1. **Métrica `Free amount remaining`** de la base. Si baja más rápido que
   ~3.300 vCore-seg/día, algo la está manteniendo despierta.
2. **Mail del budget** a los u$d 8 (80 % de 10).
3. **`minReplicas` del backend**: tiene que decir 0 siempre.

Alerta gratis sobre el free limit de SQL:

```powershell
az monitor metrics alert create -g rg-obra493 -n "sql-free-bajo" `
  --scopes $(az sql db show -g rg-obra493 -s sql-obra493 -n db-obra493 --query id -o tsv) `
  --condition "avg free_amount_remaining < 10000" `
  --description "Quedan menos de 10.000 vCore-seg gratis este mes"
```

### Si el free limit se agota

La base queda **pausada hasta el 1° del mes siguiente**. Para desbloquearla
aceptando el cobro del excedente (cambio de una sola vía, no se puede volver
atrás):

```powershell
az sql db update -g rg-obra493 -s sql-obra493 -n db-obra493 `
  --exhaustion-behavior BillOverUsage
```

El excedente se cobra a tarifa serverless normal: unos u$d 0,15 por cada
1.000 vCore-segundos extra.

## 3.bis · Visibilidad del package de GHCR

El repo `jmbbianchi/493` es público, pero **el package de GHCR nace privado igual**
en el primer push. Si el Container App queda en `ImagePullBackOff`, es eso.

Dos salidas, elegí una:

**A — hacerlo público** (más simple, es el patrón de `astorarg-backend`):
github.com/users/jmbbianchi/packages → `obra493-backend` → Package settings →
Change visibility → Public. El Container App lo baja sin credenciales.

**B — dejarlo privado** y darle credenciales al Container App:

```powershell
az containerapp registry set -g rg-obra493 -n obra493-backend `
  --server ghcr.io --username jmbbianchi --password <PAT_con_read:packages>
```

## 4 · Rollback total

```powershell
az group delete -n rg-obra493 --yes --no-wait
```

Se lleva los ocho recursos y nada más. El budget vive dentro del RG, así que
también se borra. Lo único que sobrevive fuera es el app registration de
GitHub Actions:

```powershell
az ad app delete --id (az ad app list --display-name "gh-obra493" --query "[0].appId" -o tsv)
```

## 5 · Reglas de la casa (auditoría jun-2026)

- **Nada puede impedir el escalado a cero.** Sin pollers, sin SSE con
  keep-alive, sin websockets ociosos, sin APScheduler embebido. Las tareas
  programadas son Container Apps Jobs.
- **Nada de tiers fijos.** SQL serverless con auto-pause; Container App con
  `min-replicas 0`; SWA Free.
- **Imagen magra.** El `requirements.txt` tiene seis líneas. Si aparece
  `pandas`, `openai`, `litellm` o `boto3`, es que se coló algo del boilerplate.
- **El health check no toca la base.** Si lo hiciera, cada probe la despertaría.

## 6 · Astor Monitor

Todos los recursos están dentro de `rg-obra493` con el tag
`proyecto=obra493`. El descubrimiento por Resource Graph la levanta sola,
sin configuración extra.
