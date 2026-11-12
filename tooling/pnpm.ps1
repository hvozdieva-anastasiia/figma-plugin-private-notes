param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $PnpmArgs
)

$ErrorActionPreference = 'Stop'
$pnProjectRoot = Split-Path -Parent $PSScriptRoot
$pnPackage = Get-Content -LiteralPath (Join-Path $pnProjectRoot 'package.json') -Raw | ConvertFrom-Json
$pnExpectedVersion = $pnPackage.packageManager -replace '^pnpm@', ''
$pnCommand = Get-Command pnpm -CommandType Application, ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
$pnOriginalPath = $env:PATH

try {
    if ($pnCommand) {
        $pnExecutable = $pnCommand.Source
    }
    else {
        $pnNode = (Get-Command node -CommandType Application -ErrorAction Stop).Source
        $pnNodeRoot = Split-Path -Parent (Split-Path -Parent $pnNode)
        $pnBundledCli = Join-Path $pnNodeRoot 'node_modules\pnpm\bin\pnpm.cjs'
        if (-not (Test-Path -LiteralPath $pnBundledCli -PathType Leaf)) {
            throw "pnpm $pnExpectedVersion is required. Install it in your development environment and retry."
        }

        $pnBinDirectory = Join-Path $pnProjectRoot 'work\toolchain-bin'
        New-Item -ItemType Directory -Path $pnBinDirectory -Force | Out-Null
        $pnExecutable = Join-Path $pnBinDirectory 'pnpm.cmd'
        @('@echo off', ('"' + $pnNode + '" "' + $pnBundledCli + '" %*')) |
            Set-Content -LiteralPath $pnExecutable -Encoding ascii
        $env:PATH = $pnBinDirectory + [System.IO.Path]::PathSeparator + $env:PATH
    }

    Push-Location -LiteralPath $pnProjectRoot
    try {
        $pnActualVersion = (& $pnExecutable --version | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $pnActualVersion -ne $pnExpectedVersion) {
            throw "Expected pnpm $pnExpectedVersion; received '$pnActualVersion'."
        }
        & $pnExecutable @PnpmArgs
        $pnResult = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}
finally {
    $env:PATH = $pnOriginalPath
}

exit $pnResult
