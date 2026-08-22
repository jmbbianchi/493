# =====================================================================
#  obra493 — creacion de infraestructura en Azure
#  Idempotente: se puede correr varias veces sin romper nada.
#  Requiere: az CLI con sesion iniciada (az login)
#  Rollback total: az group delete -n rg-obra493 --yes --no-wait
# =====================================================================

# Workaround extension corrupta del az CLI local — NO BORRAR
$env:AZURE_EXTENSION_DIR="$env:USERPROFILE\.azure\cliextensions_clean"

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------- vars
$SUB      = "b94b4687-9cb9-4472-aab2-c4f2b847e79c"   # astorarg.com
$APP      = "obra493"
$LOC      = "brazilsouth"
$RG       = "rg-$APP"
$ENVNAME  = "cae-$APP"
$LAW      = "law-$APP"
$SQLSRV   = "sql-$APP"
$SQLDB    = "db-$APP"
$BACKEND  = "$APP-backend"
$JOB      = "$APP-indices"
$SWA      = "swa-$APP"
$STG      = "st$APP"                                  # sin guiones, minusculas
$BUDGET   = "bud-$APP"
$IMAGE    = "ghcr.io/jmbbianchi/$APP-backend:latest"
$PLACEHOLDER = "mcr.microsoft.com/k8se/quickstart:latest"
$EMAILS   = @("jmb.bianchi@gmail.com","jose.bianchi@astorarg.com")
$TAGS     = @("proyecto=$APP","entorno=prod","owner=jose","gestion=script")
$SECRETDIR = "$env:USERPROFILE\.$APP"
$SECRETFILE = "$SECRETDIR\sqlpwd.txt"

function Step($n,$t) { Write-Host "`n[$n] $t" -ForegroundColor Cyan }
function Ok($t)      { Write-Host "    OK  $t" -ForegroundColor DarkGray }
function Skip($t)    { Write-Host "    --  ya existe: $t" -ForegroundColor DarkYellow }

# ------------------------------------------------- 0. suscripcion
Step 0 "Verificando suscripcion"
az account set --subscription $SUB | Out-Null
$acct = az account show -o json | ConvertFrom-Json
if ($acct.id -ne $SUB) { throw "Suscripcion incorrecta: $($acct.id)" }
Ok "$($acct.name)  [$($acct.id)]"

Write-Host "    Environments que NO se tocan:" -ForegroundColor DarkGray
az containerapp env list --query "[?name!='$ENVNAME'].{env:name,rg:resourceGroup}" -o tsv 2>$null |
  ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }

# ------------------------------------------------- 1. resource group
Step 1 "Resource group aislado"
if ((az group exists -n $RG) -eq "true") { Skip $RG }
else { az group create -n $RG -l $LOC --tags $TAGS -o none; Ok $RG }

# ------------------------------------------------- 2. log analytics
Step 2 "Log Analytics (retencion 30d, tope 0.1 GB/dia)"
$law = az monitor log-analytics workspace show -g $RG -n $LAW -o json 2>$null
if ($law) { Skip $LAW }
else {
  az monitor log-analytics workspace create -g $RG -n $LAW -l $LOC `
     --retention-time 30 --quota 0.1 --tags $TAGS -o none
  Ok $LAW
}
$LAW_ID  = az monitor log-analytics workspace show -g $RG -n $LAW --query customerId -o tsv
$LAW_KEY = az monitor log-analytics workspace get-shared-keys -g $RG -n $LAW --query primarySharedKey -o tsv

# ------------------------------------------------- 3. container apps env
Step 3 "Container Apps environment propio (Consumption, sin costo fijo)"
$envx = az containerapp env show -g $RG -n $ENVNAME -o json 2>$null
if ($envx) { Skip $ENVNAME }
else {
  az containerapp env create -g $RG -n $ENVNAME -l $LOC `
     --logs-destination log-analytics `
     --logs-workspace-id $LAW_ID --logs-workspace-key $LAW_KEY `
     --tags $TAGS -o none
  Ok $ENVNAME
}

# ------------------------------------------------- 4. sql serverless
Step 4 "Azure SQL serverless (free limit, auto-pause 15 min)"
if (-not (Test-Path $SECRETDIR)) { New-Item -ItemType Directory -Path $SECRETDIR -Force | Out-Null }
if (Test-Path $SECRETFILE) {
  $SQLPWD = Get-Content $SECRETFILE -Raw
  $SQLPWD = $SQLPWD.Trim()
  Ok "password reutilizada de $SECRETFILE"
} else {
  Add-Type -AssemblyName System.Web
  $SQLPWD = [System.Web.Security.Membership]::GeneratePassword(28,6)
  $SQLPWD | Out-File -FilePath $SECRETFILE -Encoding ascii -NoNewline
  Ok "password generada y guardada en $SECRETFILE (fuera del repo)"
}

$srv = az sql server show -g $RG -n $SQLSRV -o json 2>$null
if ($srv) {
  Skip $SQLSRV
  az sql server update -g $RG -n $SQLSRV --admin-password $SQLPWD -o none
} else {
  az sql server create -g $RG -n $SQLSRV -l $LOC `
     --admin-user obra493admin --admin-password $SQLPWD `
     --enable-public-network true -o none
  az resource tag --tags $TAGS -g $RG -n $SQLSRV --resource-type "Microsoft.Sql/servers" -o none
  Ok $SQLSRV
}

# firewall: solo servicios de Azure (0.0.0.0 = "Allow Azure services")
az sql server firewall-rule create -g $RG -s $SQLSRV -n AllowAzureServices `
   --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none 2>$null
Ok "firewall: solo servicios de Azure"

# tu cuenta como admin Entra del server (para conectarte sin password)
$me   = az account show --query user.name -o tsv
$meId = az ad signed-in-user show --query id -o tsv 2>$null
if ($meId) {
  az sql server ad-admin create -g $RG -s $SQLSRV --display-name $me --object-id $meId -o none 2>$null
  Ok "admin Entra: $me"
}

$db = az sql db show -g $RG -s $SQLSRV -n $SQLDB -o json 2>$null
if ($db) { Skip $SQLDB }
else {
  # --use-free-limit: 100.000 vCore-seg + 32 GB gratis por mes, de por vida.
  # --exhaustion-behavior AutoPause: si se agota, pausa hasta el mes siguiente.
  #   Techo duro de gasto = USD 0. Para no quedar bloqueado, cambiar a
  #   BillOverUsage (ver README; es un cambio de una sola via).
  az sql db create -g $RG -s $SQLSRV -n $SQLDB `
     --edition GeneralPurpose --compute-model Serverless --family Gen5 `
     --capacity 2 --min-capacity 0.5 `
     --auto-pause-delay 15 `
     --max-size 32GB `
     --backup-storage-redundancy Local `
     --zone-redundant false `
     --use-free-limit true --exhaustion-behavior AutoPause `
     --tags $TAGS -o none
  Ok "$SQLDB  (GP serverless 0.5-2 vCore, free limit ON)"
}

$CONNSTR = "Server=tcp:$SQLSRV.database.windows.net,1433;Database=$SQLDB;User ID=obra493admin;Password=$SQLPWD;Encrypt=true;TrustServerCertificate=false;Connection Timeout=60;"

# ------------------------------------------------- 5. storage (blobs)
Step 5 "Storage para PDFs, comprobantes y fotos"
$st = az storage account show -g $RG -n $STG -o json 2>$null
if ($st) { Skip $STG }
else {
  az storage account create -g $RG -n $STG -l $LOC `
     --sku Standard_LRS --kind StorageV2 --access-tier Hot `
     --min-tls-version TLS1_2 --allow-blob-public-access false `
     --tags $TAGS -o none
  Ok $STG
}
$STGKEY = az storage account keys list -g $RG -n $STG --query "[0].value" -o tsv
az storage container create --account-name $STG --account-key $STGKEY -n documentos -o none 2>$null

# ------------------------------------------------- 6. backend
Step 6 "Container App backend (min-replicas 0)"
$ca = az containerapp show -g $RG -n $BACKEND -o json 2>$null
if ($ca) {
  Skip $BACKEND
} else {
  az containerapp create -g $RG -n $BACKEND --environment $ENVNAME `
     --image $PLACEHOLDER `
     --min-replicas 0 --max-replicas 1 `
     --cpu 0.5 --memory 1.0Gi `
     --ingress external --target-port 80 `
     --system-assigned `
     --tags $TAGS -o none
  Ok "$BACKEND (imagen placeholder hasta el primer deploy)"
}

# secrets + env vars (idempotente: set pisa el valor)
az containerapp secret set -g $RG -n $BACKEND --secrets `
   "sql-conn=$CONNSTR" "stg-key=$STGKEY" -o none
az containerapp update -g $RG -n $BACKEND --set-env-vars `
   "SQL_CONNECTION_STRING=secretref:sql-conn" `
   "STORAGE_ACCOUNT=$STG" `
   "STORAGE_KEY=secretref:stg-key" `
   "STORAGE_CONTAINER=documentos" -o none
Ok "secrets y env vars configurados"

# ------------------------------------------------- 7. job de indices
Step 7 "Job de indices BCRA/INDEC (cron diario, despierta-corre-duerme)"
$job = az containerapp job show -g $RG -n $JOB -o json 2>$null
if ($job) { Skip $JOB }
else {
  az containerapp job create -g $RG -n $JOB --environment $ENVNAME `
     --trigger-type Schedule --cron-expression "0 9 * * *" `
     --image $PLACEHOLDER `
     --cpu 0.25 --memory 0.5Gi `
     --replica-timeout 300 --replica-retry-limit 2 --parallelism 1 `
     --system-assigned `
     --tags $TAGS -o none
  Ok "$JOB (09:00 UTC = 06:00 Buenos Aires)"
}
az containerapp job secret set -g $RG -n $JOB --secrets "sql-conn=$CONNSTR" -o none 2>$null

# ------------------------------------------------- 8. static web app
Step 8 "Static Web App (plan Free)"
$sw = az staticwebapp show -g $RG -n $SWA -o json 2>$null
if ($sw) { Skip $SWA }
else {
  # eastus2 = region de control; el contenido se sirve por CDN global
  az staticwebapp create -g $RG -n $SWA -l eastus2 --sku Free --tags $TAGS -o none
  Ok $SWA
}

# ------------------------------------------------- 8.bis CORS
Step "8b" "Enlazando el origen de la SWA con el backend (CORS)"
$SWAHOST_TMP = az staticwebapp show -g $RG -n $SWA --query defaultHostname -o tsv
az containerapp update -g $RG -n $BACKEND `
   --set-env-vars "CORS_ORIGINS=https://$SWAHOST_TMP" -o none
Ok "CORS_ORIGINS=https://$SWAHOST_TMP"

# ------------------------------------------------- 9. budget
Step 9 "Budget USD 10/mes con alerta por mail (80% y 100%)"
$start = (Get-Date -Day 1).ToString("yyyy-MM-01T00:00:00Z")
$end   = (Get-Date -Day 1).AddYears(5).ToString("yyyy-MM-01T00:00:00Z")
$emailsJson = ($EMAILS | ForEach-Object { "`"$_`"" }) -join ","
$budgetBody = @"
{"properties":{
  "category":"Cost","amount":10,"timeGrain":"Monthly",
  "timePeriod":{"startDate":"$start","endDate":"$end"},
  "notifications":{
    "aviso80":{"enabled":true,"operator":"GreaterThan","threshold":80,
               "contactEmails":[$emailsJson],"thresholdType":"Actual"},
    "aviso100":{"enabled":true,"operator":"GreaterThan","threshold":100,
               "contactEmails":[$emailsJson],"thresholdType":"Actual"}
  }}}
"@
$tmp = New-TemporaryFile
$budgetBody | Out-File -FilePath $tmp -Encoding utf8
az rest --method PUT `
  --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Consumption/budgets/$BUDGET`?api-version=2021-10-01" `
  --body "@$tmp" -o none
Remove-Item $tmp -Force
Ok "$BUDGET  ->  $($EMAILS -join ', ')"

# ------------------------------------------------- 10. resumen
$FQDN    = az containerapp show -g $RG -n $BACKEND --query properties.configuration.ingress.fqdn -o tsv
$SWAHOST = az staticwebapp show -g $RG -n $SWA --query defaultHostname -o tsv

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " LISTO — todo dentro de $RG" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend    https://$SWAHOST"
Write-Host "  API         https://$FQDN"
Write-Host "  SQL server  $SQLSRV.database.windows.net"
Write-Host "  Base        $SQLDB   (free limit ON, auto-pause 15 min)"
Write-Host "  Storage     $STG / documentos"
Write-Host "  Job         $JOB   09:00 UTC"
Write-Host "  Budget      USD 10/mes -> $($EMAILS -join ', ')"
Write-Host ""
Write-Host "  Password SQL guardada en: $SECRETFILE" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Falta: token de deploy de la SWA para GitHub Actions ->" -ForegroundColor Yellow
Write-Host "    az staticwebapp secrets list -g $RG -n $SWA --query properties.apiKey -o tsv" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Rollback total:" -ForegroundColor Yellow
Write-Host "    az group delete -n $RG --yes --no-wait" -ForegroundColor Yellow
Write-Host ""
