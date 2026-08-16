# ================================================================
# Vitrine de Apps — Registro de Startup no Windows
# ================================================================
# Cria tarefas agendadas (Scheduled Tasks) que iniciam a Vitrine e o
# MULT-CHAT-HUB no logon do usuário. O Mestre do PC já tem as suas próprias
# tarefas (MestreDoPC_Admin_Launcher / MestreDoPC_Startup).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-startup.ps1
#
# Idempotente: rodar de novo apenas recria as tarefas com os mesmos valores.
# ================================================================

$ErrorActionPreference = "Stop"

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
    Write-Error "Node.js não encontrado. Instale Node.js LTS antes de registrar o startup."
    exit 1
}

$pnpm = (Get-Command pnpm.cmd -ErrorAction SilentlyContinue).Source
if (-not $pnpm) {
    Write-Error "pnpm não encontrado. Instale pnpm antes de registrar o MULT-CHAT-HUB."
    exit 1
}

$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name

function Register-AppTask {
    param(
        [string] $TaskName,
        [string] $Executable,
        [string] $Arguments,
        [string] $WorkingDir
    )

    try {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    } catch {}

    $action = New-ScheduledTaskAction `
        -Execute $Executable `
        -Argument $Arguments `
        -WorkingDirectory $WorkingDir

    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId

    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Hours 0)

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Force | Out-Null

    Write-Host "[OK] Tarefa '$TaskName' registrada." -ForegroundColor Green
}

# 1. Vitrine de Apps — servidor na porta 4400
Register-AppTask `
    -TaskName "VitrineDeApps_Server" `
    -Executable $node `
    -Arguments "server/index.js" `
    -WorkingDir "C:\Users\Jeanc\vitrine-de-apps"

# 2. MULT-CHAT-HUB — frontend lite na porta 3001
Register-AppTask `
    -TaskName "MultChatHub_Lite" `
    -Executable $pnpm `
    -Arguments "run dev:lite" `
    -WorkingDir "C:\Users\Jeanc\MULT-CHAT-HUB"

Write-Host ""
Write-Host "Startup registrado. Os apps sobem no próximo logon." -ForegroundColor Cyan
Write-Host "Para testar agora: Start-ScheduledTask -TaskName 'VitrineDeApps_Server'" -ForegroundColor DarkGray
