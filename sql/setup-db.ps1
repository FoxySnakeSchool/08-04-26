# =============================================================================
# setup-db.ps1 — Création de la base de données unitee_veille
# Exécute les 4 fichiers SQL dans le bon ordre
# =============================================================================
# Usage :
#   .\setup-db.ps1
#   .\setup-db.ps1 -DBUser root -DBPassword monpass
# =============================================================================

param(
    [string]$DBHost     = "localhost",
    [string]$DBPort     = "3306",
    [string]$DBUser     = "root",
    [string]$DBPassword = ""
)

# Charger le .env si présent pour récupérer les valeurs par défaut
$envFile = Join-Path $PSScriptRoot "..\backend\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | Where-Object { $_ -match "^\s*[^#]" } | ForEach-Object {
        if ($_ -match "^\s*DB_HOST\s*=\s*(.+)$")     { if ($DBHost     -eq "localhost") { $DBHost     = $Matches[1].Trim() } }
        if ($_ -match "^\s*DB_PORT\s*=\s*(.+)$")     { if ($DBPort     -eq "3306")      { $DBPort     = $Matches[1].Trim() } }
        if ($_ -match "^\s*DB_USER\s*=\s*(.+)$")     { if ($DBUser     -eq "root")      { $DBUser     = $Matches[1].Trim() } }
        if ($_ -match "^\s*DB_PASSWORD\s*=\s*(.*)$") { if ($DBPassword -eq "")          { $DBPassword = $Matches[1].Trim() } }
    }
}

# Le script est dans sql/ — les fichiers SQL sont dans le même dossier
$sqlDir = $PSScriptRoot

$files = @(
    "schema.sql",
    "functions.sql",
    "procedures.sql",
    "triggers.sql"
)

# Vérifier que mysql est dans le PATH
if (-not (Get-Command mysql -ErrorAction SilentlyContinue)) {
    Write-Error "mysql n'est pas dans le PATH. Ajoute le dossier bin de MySQL (ex: C:\Program Files\MySQL\MySQL Server 8.0\bin) à ta variable d'environnement PATH."
    exit 1
}

# Construire les arguments de connexion
$connArgs = @("-h", $DBHost, "-P", $DBPort, "-u", $DBUser)
if ($DBPassword -ne "") {
    $connArgs += "-p$DBPassword"
}

Write-Host ""
Write-Host "=== Setup base de données unitee_veille ===" -ForegroundColor Cyan
Write-Host "  Host : $DBHost`:$DBPort"
Write-Host "  User : $DBUser"
Write-Host ""

$step = 1
foreach ($file in $files) {
    $path = Join-Path $sqlDir $file
    if (-not (Test-Path $path)) {
        Write-Error "Fichier introuvable : $path"
        exit 1
    }

    Write-Host "[$step/4] Exécution de $file ..." -ForegroundColor Yellow

    # schema.sql n'a pas encore de DB cible ; les suivants utilisent unitee_veille
    if ($file -eq "schema.sql") {
        $result = Get-Content $path -Raw | & mysql @connArgs --default-character-set=utf8mb4 2>&1
    } else {
        $result = Get-Content $path -Raw | & mysql @connArgs --default-character-set=utf8mb4 unitee_veille 2>&1
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Error "Erreur lors de l'exécution de $file :`n$result"
        exit 1
    }

    if ($result) {
        Write-Host "   $result" -ForegroundColor DarkGray
    }

    Write-Host "   OK" -ForegroundColor Green
    $step++
}

Write-Host ""
Write-Host "Base de données créée avec succès !" -ForegroundColor Green
Write-Host ""
Write-Host "Prochaines étapes :"
Write-Host "  cd backend"
Write-Host "  npm install"
Write-Host "  node src/index.js"
