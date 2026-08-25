# =====================================================================
#  obra493 - creacion de infraestructura en Azure
#  Idempotente: se puede correr varias veces sin romper nada.
#  Requiere: az CLI con sesion iniciada (az login)
#  Rollback total: az group delete -n rg-obra493 --yes --no-wait
# =====================================================================

# Workaround extension corrupta del az CLI local - NO BORRAR
$env:AZURE_EXTENSION_DIR="$env:USERPROFILE\.azure\cliextensions_clean"

# OJO: NO usar ErrorActionPreference = Stop.
# az escribe al stderr en situaciones normales (por ejemplo cuando
# consultamos a proposito un recurso que todavia no existe). Con Stop,
# PowerShell convierte ese stderr en excepcion y corta el script.
# En su lugar chequeamos $LASTEXITCODE explicitamente con Requiere.
$ErrorActionPreference = "Continue"

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
$STG      = "st$APP"
$BUDGET   = "bud-$APP"
$PLACEHOLDER = "mcr.microsoft.com/k8se/quickstart:latest"
$EMAILS   = @("jmb.bianchi@gmail.com","jose.bianchi@astorarg.com")
$TAGS     = @("proyecto=$APP","entorno=prod","owner=jose","gestion=script")
$SECRETDIR  = "$env:USERPROFILE\.$APP"
$SECRETFILE = "$SECRETDIR\sqlpwd.txt"

# ------------------------------------------------------------- helpers
function Step($n,$t) { Write-Host "`n[$n] $t" -ForegroundColor Cyan }
function Ok($t)      { Write-Host "    OK  $t" -ForegroundColor DarkGray }
function Skip($t)    { Write-Host "    --  ya existe: $t" -ForegroundColor DarkYellow }

# Consulta si un recurso existe. Nunca lanza excepcion ni deja
# LASTEXITCODE sucio: el stderr de az es esperable aca.
function Existe {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Cmd)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $null = & az @Cmd 2>&1
    $hay = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prev
    $global:LASTEXITCODE = 0
    return $hay
}

# Password fuerte, portable entre Windows PowerShell 5.1 y PowerShell 7.
# (System.Web.Security.Membership solo existe en .NET Framework.)
# Garantiza mayuscula, minuscula, digito y simbolo: SQL Server exige
# al menos 3 de las 4 categorias. Se excluyen caracteres ambiguos y
# los que rompen connection strings (; ' " espacio).
function Nueva-Password {
    $may = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    $min = 'abcdefghijkmnpqrstuvwxyz'
    $num = '23456789'
    $sim = '!#%*+-=?_'
    $todo = $may + $min + $num + $sim
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $sacar = {
        param($set, $n)
        $r = ''
        for ($i = 0; $i -lt $n; $i++) {
            $b = New-Object byte[] 4
            $rng.GetBytes($b)
            $idx = [BitConverter]::ToUInt32($b, 0) % $set.Length
            $r += $set[$idx]
        }
        return $r
    }
    $pwd = (& $sacar $may 2) + (& $sacar $min 2) + (& $sacar $num 2) +
           (& $sacar $sim 2) + (& $sacar $todo 16)
    # mezclar para que el patron no sea predecible
    $chars = $pwd.ToCharArray()
    for ($i = $chars.Length - 1; $i -gt 0; $i--) {
        $b = New-Object byte[] 4
        $rng.GetBytes($b)
        $j = [BitConverter]::ToUInt32($b, 0) % ($i + 1)
        $t = $chars[$i]; $chars[$i] = $chars[$j]; $chars[$j] = $t
    }
    return -join $chars
}

# Corta el script si el comando anterior fallo de verdad.
function Requiere($que) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "  FALLO: $que  (codigo $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "  Nada quedo a medias que no se pueda borrar con:" -ForegroundColor Yellow
        Write-Host "    az group delete -n $RG --yes --no-wait" -ForegroundColor Yellow
        exit 1
    }
}

# ------------------------------------------------- 0. suscripcion
Step 0 "Verificando suscripcion"
az account set --subscription $SUB | Out-Null
Requiere "seleccionar la suscripcion $SUB"
$acct = az account show -o json | ConvertFrom-Json
Requiere "leer la suscripcion activa"
if ($acct.id -ne $SUB) { Write-Host "  Suscripcion incorrecta: $($acct.id)" -ForegroundColor Red; exit 1 }
Ok "$($acct.name)  [$($acct.id)]"

Write-Host "    Environments que NO se tocan:" -ForegroundColor DarkGray
az containerapp env list --query "[?name!='$ENVNAME'].{env:name,rg:resourceGroup}" -o tsv |
  ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }

# ------------------------------------------------- 1. resource group
Step 1 "Resource group aislado"
if ((az group exists -n $RG) -eq "true") { Skip $RG }
else {
  az group create -n $RG -l $LOC --tags $TAGS -o none
  Requiere "crear el resource group $RG"
  Ok $RG
}

# ------------------------------------------------- 2. log analytics
Step 2 "Log Analytics (retencion 30d, tope 0.1 GB/dia)"
if (Existe monitor log-analytics workspace show -g $RG -n $LAW) { Skip $LAW }
else {
  az monitor log-analytics workspace create -g $RG -n $LAW -l $LOC `
     --retention-time 30 --quota 0.1 --tags $TAGS -o none
  Requiere "crear el workspace $LAW"
  Ok $LAW
}
$LAW_ID  = az monitor log-analytics workspace show -g $RG -n $LAW --query customerId -o tsv
Requiere "leer el id del workspace"
$LAW_KEY = az monitor log-analytics workspace get-shared-keys -g $RG -n $LAW --query primarySharedKey -o tsv
Requiere "leer la clave del workspace"

# ------------------------------------------------- 3. container apps env
Step 3 "Container Apps environment propio (Consumption, sin costo fijo)"
if (Existe containerapp env show -g $RG -n $ENVNAME) { Skip $ENVNAME }
else {
  az containerapp env create -g $RG -n $ENVNAME -l $LOC `
     --logs-destination log-analytics `
     --logs-workspace-id $LAW_ID --logs-workspace-key $LAW_KEY `
     --tags $TAGS -o none
  Requiere "crear el environment $ENVNAME"
  Ok $ENVNAME
}

# ------------------------------------------------- 4. sql serverless
Step 4 "Azure SQL serverless (free limit, auto-pause 60 min fijo)"
if (-not (Test-Path $SECRETDIR)) { New-Item -ItemType Directory -Path $SECRETDIR -Force | Out-Null }
if (Test-Path $SECRETFILE) {
  $SQLPWD = (Get-Content $SECRETFILE -Raw).Trim()
  Ok "password reutilizada de $SECRETFILE"
} else {
  $SQLPWD = Nueva-Password
  $SQLPWD | Out-File -FilePath $SECRETFILE -Encoding ascii -NoNewline
  Ok "password generada y guardada en $SECRETFILE (fuera del repo)"
}
if ([string]::IsNullOrWhiteSpace($SQLPWD) -or $SQLPWD.Length -lt 16) {
  Write-Host "  FALLO: la password de SQL quedo vacia o muy corta." -ForegroundColor Red
  Write-Host "  Borra $SECRETFILE y volve a correr el script." -ForegroundColor Yellow
  exit 1
}

if (Existe sql server show -g $RG -n $SQLSRV) {
  Skip $SQLSRV
  az sql server update -g $RG -n $SQLSRV --admin-password $SQLPWD -o none
  Requiere "actualizar la password del server"
} else {
  az sql server create -g $RG -n $SQLSRV -l $LOC `
     --admin-user obra493admin --admin-password $SQLPWD `
     --enable-public-network true -o none
  Requiere "crear el SQL server $SQLSRV"
  Ok $SQLSRV
}

az sql server firewall-rule create -g $RG -s $SQLSRV -n AllowAzureServices `
   --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none
$global:LASTEXITCODE = 0
Ok "firewall: servicios de Azure"

# Tu IP publica, para poder consultar desde el portal, VS Code o pgAdmin.
# Sin esto, el editor de consultas del portal rebota con
# "La direccion IP no tiene permiso para acceder a este servidor".
# Si tu IP cambia (la mayoria de las conexiones hogarenas son dinamicas),
# volve a correr el script y se actualiza sola.
try {
  $MIIP = (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 10).Trim()
} catch { $MIIP = $null }
if ($MIIP -match '^\d{1,3}(\.\d{1,3}){3}$') {
  az sql server firewall-rule create -g $RG -s $SQLSRV -n mi-pc `
     --start-ip-address $MIIP --end-ip-address $MIIP -o none
  $global:LASTEXITCODE = 0
  Ok "firewall: tu IP $MIIP"
} else {
  Write-Host "    --  no se pudo detectar tu IP publica; agregala a mano si el portal te rebota" -ForegroundColor DarkYellow
}

$me   = az account show --query user.name -o tsv
$meId = az ad signed-in-user show --query id -o tsv 2>$null
if ($meId) {
  az sql server ad-admin create -g $RG -s $SQLSRV --display-name $me --object-id $meId -o none
  $global:LASTEXITCODE = 0
  Ok "admin Entra: $me"
}

if (Existe sql db show -g $RG -s $SQLSRV -n $SQLDB) { Skip $SQLDB }
else {
  # --use-free-limit: 100.000 vCore-seg + 32 GB gratis por mes, de por vida.
  # --exhaustion-behavior AutoPause: si se agota, pausa hasta el mes siguiente.
  #   Techo duro de gasto = USD 0. Para no quedar bloqueado se puede cambiar
  #   a BillOverUsage (README-infra.md; es un cambio de una sola via).
  #
  # OJO: NO se puede pasar --auto-pause-delay junto con --use-free-limit.
  # Azure responde ProvisioningDisabled: "Only default value for auto pause
  # delay is allowed for Free Limit database". El default es 60 minutos y
  # queda fijo. Consecuencia practica: cada sesion de uso consume su duracion
  # MAS una hora de espera antes de pausar. El presupuesto real son
  # 100.000 / 0.5 = 55,5 horas online por mes. Ver README-infra.md.
  #
  # --backup-storage-redundancy Local: si no se pasa, az se detiene a
  # preguntar si acepta geo-redundante. Un script que pregunta no sirve,
  # y ademas el free offer fuerza LRS de todos modos.
  # --yes: silencia cualquier otra confirmacion interactiva.
  # --max-size no se pasa: el free offer ya lo fija en 32 GB.
  az sql db create -g $RG -s $SQLSRV -n $SQLDB `
     --edition GeneralPurpose --compute-model Serverless --family Gen5 `
     --capacity 2 --min-capacity 0.5 `
     --use-free-limit true --exhaustion-behavior AutoPause `
     --backup-storage-redundancy Local `
     --yes `
     --tags $TAGS -o none
  Requiere "crear la base $SQLDB"
  Ok "$SQLDB  (GP serverless 0.5-2 vCore, free limit ON, pausa a los 60 min)"
}

$CONNSTR = "Server=tcp:$SQLSRV.database.windows.net,1433;Database=$SQLDB;User ID=obra493admin;Password=$SQLPWD;Encrypt=true;TrustServerCertificate=false;Connection Timeout=60;"

# ------------------------------------------------- 5. storage (blobs)
Step 5 "Storage para PDFs, comprobantes y fotos"
if (Existe storage account show -g $RG -n $STG) { Skip $STG }
else {
  az storage account create -g $RG -n $STG -l $LOC `
     --sku Standard_LRS --kind StorageV2 --access-tier Hot `
     --min-tls-version TLS1_2 --allow-blob-public-access false `
     --tags $TAGS -o none
  Requiere "crear el storage account $STG"
  Ok $STG
}
$STGKEY = az storage account keys list -g $RG -n $STG --query "[0].value" -o tsv
Requiere "leer la clave del storage"
az storage container create --account-name $STG --account-key $STGKEY -n documentos -o none
$global:LASTEXITCODE = 0

# ------------------------------------------------- 6. backend
Step 6 "Container App backend (min-replicas 0)"
if (Existe containerapp show -g $RG -n $BACKEND) { Skip $BACKEND }
else {
  az containerapp create -g $RG -n $BACKEND --environment $ENVNAME `
     --image $PLACEHOLDER `
     --min-replicas 0 --max-replicas 1 `
     --cpu 0.5 --memory 1.0Gi `
     --ingress external --target-port 8080 `
     --system-assigned `
     --tags $TAGS -o none
  Requiere "crear el container app $BACKEND"
  Ok "$BACKEND (imagen placeholder hasta el primer deploy)"
}

az containerapp secret set -g $RG -n $BACKEND --secrets "sql-conn=$CONNSTR" "stg-key=$STGKEY" -o none
Requiere "cargar los secrets del backend"
az containerapp update -g $RG -n $BACKEND --set-env-vars `
   "SQL_CONNECTION_STRING=secretref:sql-conn" `
   "STORAGE_ACCOUNT=$STG" `
   "STORAGE_KEY=secretref:stg-key" `
   "STORAGE_CONTAINER=documentos" -o none
Requiere "cargar las variables de entorno del backend"
Ok "secrets y env vars configurados"

# ------------------------------------------------- 7. job de indices
Step 7 "Job de indices BCRA/INDEC (cron diario, despierta-corre-duerme)"
if (Existe containerapp job show -g $RG -n $JOB) { Skip $JOB }
else {
  az containerapp job create -g $RG -n $JOB --environment $ENVNAME `
     --trigger-type Schedule --cron-expression "0 9 * * *" `
     --image $PLACEHOLDER `
     --cpu 0.25 --memory 0.5Gi `
     --replica-timeout 300 --replica-retry-limit 2 --parallelism 1 `
     --system-assigned `
     --tags $TAGS -o none
  Requiere "crear el job $JOB"
  Ok "$JOB (09:00 UTC = 06:00 Buenos Aires)"
}
az containerapp job secret set -g $RG -n $JOB --secrets "sql-conn=$CONNSTR" -o none
$global:LASTEXITCODE = 0

# ------------------------------------------------- 8. static web app
Step 8 "Static Web App (plan Free)"
if (Existe staticwebapp show -g $RG -n $SWA) { Skip $SWA }
else {
  az staticwebapp create -g $RG -n $SWA -l eastus2 --sku Free --tags $TAGS -o none
  Requiere "crear la static web app $SWA"
  Ok $SWA
}

# ------------------------------------------------- 8b. CORS
Step "8b" "Enlazando el origen de la SWA con el backend (CORS)"
$SWAHOST = az staticwebapp show -g $RG -n $SWA --query defaultHostname -o tsv
Requiere "leer el hostname de la SWA"
az containerapp update -g $RG -n $BACKEND --set-env-vars "CORS_ORIGINS=https://$SWAHOST" -o none
Requiere "configurar CORS en el backend"
Ok "CORS_ORIGINS=https://$SWAHOST"

# ------------------------------------------------- 9. budget
Step 9 "Budget USD 10/mes con alerta por mail (80% y 100%)"
$start = (Get-Date -Day 1).ToString("yyyy-MM-01T00:00:00Z")
$end   = (Get-Date -Day 1).AddYears(5).ToString("yyyy-MM-01T00:00:00Z")

# Se arma con hashtables y ConvertTo-Json: sin here-strings, sin problemas
# de comillas ni de encoding.
$notif = @{
  aviso80  = @{ enabled=$true; operator="GreaterThan"; threshold=80
                contactEmails=$EMAILS; thresholdType="Actual" }
  aviso100 = @{ enabled=$true; operator="GreaterThan"; threshold=100
                contactEmails=$EMAILS; thresholdType="Actual" }
}
$body = @{ properties = @{
  category="Cost"; amount=10; timeGrain="Monthly"
  timePeriod=@{ startDate=$start; endDate=$end }
  notifications=$notif } } | ConvertTo-Json -Depth 10 -Compress

$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp, $body)
$url = "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG" +
       "/providers/Microsoft.Consumption/budgets/$BUDGET" +
       "?api-version=2021-10-01"
az rest --method PUT --url $url --body "@$tmp" -o none
Requiere "crear el budget $BUDGET"
Remove-Item $tmp -Force
Ok "$BUDGET  ->  $($EMAILS -join ', ')"

# ------------------------------------------------- 10. resumen
$FQDN = az containerapp show -g $RG -n $BACKEND --query properties.configuration.ingress.fqdn -o tsv

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " LISTO - todo dentro de $RG" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend    https://$SWAHOST"
Write-Host "  API         https://$FQDN"
Write-Host "  SQL server  $SQLSRV.database.windows.net"
Write-Host "  Base        $SQLDB   (free limit ON, auto-pause 60 min)"
Write-Host "  Storage     $STG / documentos"
Write-Host "  Job         $JOB   09:00 UTC"
Write-Host "  Budget      USD 10/mes -> $($EMAILS -join ', ')"
Write-Host ""
Write-Host "  Password SQL guardada en: $SECRETFILE" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Paso siguiente - token de deploy de la SWA:" -ForegroundColor Yellow
Write-Host "    az staticwebapp secrets list -g $RG -n $SWA --query properties.apiKey -o tsv" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Variable API_URL para GitHub Actions:" -ForegroundColor Yellow
Write-Host "    https://$FQDN" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Rollback total:" -ForegroundColor Yellow
Write-Host "    az group delete -n $RG --yes --no-wait" -ForegroundColor Yellow
Write-Host ""
