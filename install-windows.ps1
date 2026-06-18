<#
=======================================================================
 HawkDot — instalador do AGENTE para Windows (PowerShell)

 O que ele faz (equivalente ao install.sh do Linux):
   1. Verifica se é Administrador e se o Node.js (>= 18) está instalado.
   2. Copia o agente para C:\ProgramData\HawkDotAgent (local estável).
   3. Gera o config.json (backend da VPS, nome da máquina, intervalo).
   4. Registra a máquina enviando UMA coleta de teste.
   5. Cria uma Tarefa Agendada que roda o agente EM SEGUNDO PLANO,
      iniciando automaticamente a CADA BOOT (gatilho "AtStartup", conta
      SYSTEM) — ou seja, ao desligar e ligar a máquina ele volta sozinho.

 PASSO A PASSO (debug humano):
   - Logs do agente:  C:\ProgramData\HawkDotAgent\agent.log
   - Ver a tarefa:    Get-ScheduledTask -TaskName HawkDotAgent
   - Status/última execução: Get-ScheduledTaskInfo -TaskName HawkDotAgent
   - O agente em si faz um loop interno a cada intervalSeconds; a tarefa
     só garante que ele suba no boot e reinicie se cair.

 USO (abra o PowerShell COMO ADMINISTRADOR, na raiz do projeto):
   # instalar apontando para a VPS (padrão):
   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1

   # instalar customizando:
   .\install-windows.ps1 -BackendUrl "http://72.62.10.121" -Name "PC do Joao" -Interval 60

   # desinstalar:
   .\install-windows.ps1 -Uninstall
=======================================================================
#>

[CmdletBinding()]
param(
  [string]$BackendUrl = "http://72.62.10.121",   # backend da VPS (padrão)
  [string]$Name       = $env:COMPUTERNAME,        # nome do agente
  [int]   $Interval   = 60,                        # segundos entre coletas
  [switch]$Uninstall                              # remove o agente
)

$ErrorActionPreference = "Stop"

# ---- constantes ----
$TaskName   = "HawkDotAgent"
$InstallDir = Join-Path $env:ProgramData "HawkDotAgent"
$AgentSrc   = Join-Path $PSScriptRoot "client-agent"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

# ---- precisa ser Administrador (para tarefa AtStartup e ProgramData) ----
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Error "Execute este script COMO ADMINISTRADOR (botao direito no PowerShell > Executar como administrador)."
  exit 1
}

# =====================================================================
# DESINSTALAÇÃO
# =====================================================================
if ($Uninstall) {
  Write-Step "Desinstalando o agente HawkDot..."
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask  -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "    tarefa agendada removida."
  } else {
    Write-Host "    tarefa agendada nao encontrada."
  }
  if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
    Write-Host "    pasta $InstallDir removida."
  }
  Write-Host "`n[OK] Agente desinstalado desta maquina." -ForegroundColor Green
  exit 0
}

# =====================================================================
# INSTALAÇÃO
# =====================================================================

Write-Step "[1/5] Verificando Node.js..."
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) {
  Write-Error "Node.js nao encontrado. Instale a versao LTS em https://nodejs.org (>= 18) e rode de novo."
  exit 1
}
$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) {
  Write-Error "Node.js >= 18 necessario (encontrado: $(& node -v))."
  exit 1
}
Write-Host "    Node $(& node -v) OK"

Write-Step "[2/5] Copiando o agente para $InstallDir ..."
if (-not (Test-Path $AgentSrc)) {
  Write-Error "Pasta do agente nao encontrada: $AgentSrc (rode este script na raiz do projeto)."
  exit 1
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item (Join-Path $AgentSrc "agent.js")             $InstallDir -Force
Copy-Item (Join-Path $AgentSrc "lib")                  $InstallDir -Recurse -Force
Copy-Item (Join-Path $AgentSrc "config.example.json")  $InstallDir -Force
Copy-Item (Join-Path $AgentSrc "package.json")         $InstallDir -Force
Write-Host "    arquivos copiados."

Write-Step "[3/5] Gerando config.json (backend=$BackendUrl, nome=$Name, intervalo=${Interval}s)..."
$cfg = Get-Content (Join-Path $InstallDir "config.example.json") -Raw | ConvertFrom-Json
$cfg.backendUrl      = $BackendUrl
$cfg.agentName       = $Name
$cfg.intervalSeconds = $Interval
$cfg | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $InstallDir "config.json") -Encoding UTF8
Write-Host "    config.json criado."

Write-Step "[4/5] Registrando a maquina (coleta de teste)..."
Push-Location $InstallDir
try { & $node.Source "agent.js" "--once" }
finally { Pop-Location }

Write-Step "[5/5] Configurando execucao em segundo plano + auto-start no boot..."
# Wrapper .cmd: roda o agente (loop interno) e joga a saida no agent.log.
$wrapperPath = Join-Path $InstallDir "run-agent.cmd"
@"
@echo off
cd /d "%~dp0"
node agent.js >> agent.log 2>&1
"@ | Set-Content -Path $wrapperPath -Encoding ASCII

# Tarefa agendada: roda como SYSTEM, no boot, em segundo plano, e reinicia se cair.
$action  = New-ScheduledTaskAction -Execute $wrapperPath -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -Hidden `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)   # 0 = sem limite (loop continuo)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null

# Sobe agora mesmo (sem esperar o proximo boot).
Start-ScheduledTask -TaskName $TaskName
Write-Host "    tarefa '$TaskName' criada e iniciada (roda no boot, em segundo plano)."

Write-Host "`n[OK] Instalacao concluida." -ForegroundColor Green
Write-Host "Painel: $BackendUrl"
Write-Host "Logs:   $InstallDir\agent.log"
