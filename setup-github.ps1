# =====================================================================
#  obra493 - conexion entre GitHub Actions y Azure
#  Crea el login federado (sin passwords) y te imprime los 4 secrets
#  y la variable que hay que cargar en el repo.
#  Idempotente: si ya existe, lo reutiliza.
# =====================================================================

$env:AZURE_EXTENSION_DIR="$env:USERPROFILE\.azure\cliextensions_clean"
$ErrorActionPreference = "Continue"

$SUB   = "b94b4687-9cb9-4472-aab2-c4f2b847e79c"
$RG    = "rg-obra493"
$SWA   = "swa-obra493"
$APPRG = "obra493-backend"
$REPO  = "jmbbianchi/493"
$APPNAME = "gh-obra493"

function Ok($t)   { Write-Host "    OK  $t" -ForegroundColor DarkGray }
function Step($n,$t){ Write-Host "`n[$n] $t" -ForegroundColor Cyan }
function Requiere($que) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n  FALLO: $que  (codigo $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}

az account set --subscription $SUB | Out-Null
Requiere "seleccionar la suscripcion"

# ------------------------------------------------- 1. app registration
Step 1 "Identidad de GitHub Actions en Entra"
$APPID = az ad app list --display-name $APPNAME --query "[0].appId" -o tsv
if ([string]::IsNullOrWhiteSpace($APPID)) {
    $APPID = az ad app create --display-name $APPNAME --query appId -o tsv
    Requiere "crear el app registration (necesitas permiso para crear apps en el tenant)"
    Ok "creada: $APPNAME"
    Start-Sleep -Seconds 10        # Entra tarda en propagar
} else {
    Ok "ya existe: $APPNAME"
}

$SPID = az ad sp list --filter "appId eq '$APPID'" --query "[0].id" -o tsv
if ([string]::IsNullOrWhiteSpace($SPID)) {
    az ad sp create --id $APPID -o none
    Requiere "crear el service principal"
    Ok "service principal creado"
    Start-Sleep -Seconds 10
} else {
    Ok "service principal ya existe"
}

# ------------------------------------------------- 2. permiso acotado al RG
Step 2 "Permiso Contributor, SOLO sobre $RG"
$SCOPE = "/subscriptions/$SUB/resourceGroups/$RG"
$yaTiene = az role assignment list --assignee $APPID --scope $SCOPE `
             --query "[?roleDefinitionName=='Contributor'] | length(@)" -o tsv
if ($yaTiene -eq "1") { Ok "ya tenia el permiso" }
else {
    az role assignment create --assignee $APPID --role Contributor --scope $SCOPE -o none
    $global:LASTEXITCODE = 0
    Ok "Contributor sobre $RG (no sobre la suscripcion)"
}

# ------------------------------------------------- 3. credenciales federadas
Step 3 "Credenciales federadas para $REPO"

# GitHub cambio el formato del claim "sub" el 15-jul-2026. Los repos creados
# despues de esa fecha mandan:
#   repo:<owner>@<ownerId>/<repo>@<repoId>:ref:refs/heads/main
# en vez del formato viejo:
#   repo:<owner>/<repo>:ref:refs/heads/main
# Si la credencial no coincide exactamente, el login federado falla con
# AADSTS700213. Creamos las dos, asi anda con cualquiera de los dos formatos.
$subs = [ordered]@{ "gh-main" = "repo:${REPO}:ref:refs/heads/main" }
try {
    $meta = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO" `
              -Headers @{ "User-Agent" = "obra493" } -TimeoutSec 15
    $subs["gh-main-inmutable"] = "repo:$($meta.owner.login)@$($meta.owner.id)/$($meta.name)@$($meta.id):ref:refs/heads/main"
} catch {
    Write-Host "  aviso: no pude leer los IDs en api.github.com, creo solo el formato viejo" -ForegroundColor Yellow
}

foreach ($nombre in $subs.Keys) {
    $elSub = $subs[$nombre]
    $ya = az ad app federated-credential list --id $APPID --query "[?name=='$nombre'] | length(@)" -o tsv
    if ($ya -eq "1") { Ok "ya existe la credencial $nombre"; continue }

    # El JSON va por archivo: pasarlo inline en PowerShell rompe las comillas.
    $fed = @{
        name      = $nombre
        issuer    = "https://token.actions.githubusercontent.com"
        subject   = $elSub
        audiences = @("api://AzureADTokenExchange")
    } | ConvertTo-Json -Compress

    $f = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($f, $fed)
    az ad app federated-credential create --id $APPID --parameters "@$f" -o none
    Requiere "crear la credencial federada $nombre"
    Remove-Item $f -Force
    Ok "$nombre -> $elSub"
}

# ------------------------------------------------- 4. datos para el repo
Step 4 "Recolectando lo que hay que cargar en GitHub"
$TENANT = az account show --query tenantId -o tsv
$TOKEN  = az staticwebapp secrets list -g $RG -n $SWA --query properties.apiKey -o tsv
Requiere "leer el token de deploy de la Static Web App"
$FQDN   = az containerapp show -g $RG -n $APPRG --query properties.configuration.ingress.fqdn -o tsv
Requiere "leer la URL del backend"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " CARGAR EN github.com/$REPO" -ForegroundColor Green
Write-Host " Settings > Secrets and variables > Actions" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  PESTANA 'Secrets'  (New repository secret)" -ForegroundColor Yellow
Write-Host ""
Write-Host "    AZURE_CLIENT_ID"
Write-Host "    $APPID" -ForegroundColor White
Write-Host ""
Write-Host "    AZURE_TENANT_ID"
Write-Host "    $TENANT" -ForegroundColor White
Write-Host ""
Write-Host "    AZURE_SUBSCRIPTION_ID"
Write-Host "    $SUB" -ForegroundColor White
Write-Host ""
Write-Host "    AZURE_SWA_TOKEN"
Write-Host "    $TOKEN" -ForegroundColor White
Write-Host ""
Write-Host "  PESTANA 'Variables'  (New repository variable)" -ForegroundColor Yellow
Write-Host ""
Write-Host "    API_URL"
Write-Host "    https://$FQDN" -ForegroundColor White
Write-Host ""
Write-Host "  Son pestanas distintas: los 4 primeros en Secrets," -ForegroundColor DarkYellow
Write-Host "  API_URL en Variables. Si API_URL va como secret," -ForegroundColor DarkYellow
Write-Host "  el build del front la recibe vacia y no encuentra el API." -ForegroundColor DarkYellow
Write-Host ""
