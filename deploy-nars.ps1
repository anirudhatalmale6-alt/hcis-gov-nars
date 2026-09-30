<#
  NARS on the Government box.

  NARS is a separate application from HCIS - assessors work in it, and a
  completed assessment then appears in HCIS under Needs Assessment. The
  database side of that went on with the catch-up; this is the application
  itself, which was never in that package.

  On the office server NARS has its own nginx site on port 8083. This box runs
  IIS, so rather than build a second site, NARS goes inside the HCIS one:

    wwwroot\nars\index.html   the NARS page
    wwwroot\assets\           its seven files, alongside HCIS's

  That works because of three things, each checked rather than assumed:

    * NARS navigates by #hash, so it runs happily from a sub-folder and needs
      no server-side routing rules.
    * Its file names do not collide with HCIS's - HCIS ships index-<hash>.js
      and .css, NARS ships app.js, api.js, views.js, nars.css and three media
      files. This script refuses to run if that ever stops being true.
    * It asks for /rest/v1/, which this site already forwards to the data API
      for HCIS. Same database and same sign-in AS THE HCIS ON THIS BOX -
      which is NOT the office server's database, and not its accounts.

  Nothing belonging to HCIS is touched: not its index.html, not its bundle,
  and not config.js.
#>

param(
    [string]$Root = 'C:\HCIS'
)

$ErrorActionPreference = 'Stop'
function Say($m, $c = 'Gray') { Write-Host "  $m" -ForegroundColor $c }
function Rule { Write-Host '  ------------------------------------------------------------' }

$site   = Join-Path $Root 'wwwroot'
$source = $PSScriptRoot

Write-Host ''
Say '============================================================'
Say ' NARS - Government box'
Say '============================================================'
Write-Host ''

if (-not (Test-Path $site)) {
    Say "The HCIS site folder was not found at $site." 'Red'
    Say 'Pass the right one, e.g.  deploy-nars.ps1 -Root D:\HCIS' 'Red'
    exit 1
}
if (-not (Test-Path (Join-Path $source 'wwwroot\nars\index.html'))) {
    Say 'This is not unpacked - wwwroot\nars\index.html is missing.' 'Red'
    Say 'Right-click the zip, Extract All, then run it from that folder.' 'Red'
    exit 1
}

# ---- refuse to overwrite anything of HCIS's ------------------------------
# The whole approach rests on the two applications having different file
# names. If that ever stops being true, stop rather than quietly replace a
# file HCIS is serving.
$incoming = Get-ChildItem (Join-Path $source 'wwwroot\assets') -File
$existing = @()
if (Test-Path (Join-Path $site 'assets')) {
    $existing = Get-ChildItem (Join-Path $site 'assets') -File | Select-Object -ExpandProperty Name
}
$clash = $incoming | Where-Object { $existing -contains $_.Name } |
         Where-Object { -not (Test-Path (Join-Path $site "assets\$($_.Name)")) -or
                        (Get-FileHash (Join-Path $site "assets\$($_.Name)")).Hash -ne (Get-FileHash $_.FullName).Hash }
if ($clash) {
    Say 'STOPPING - these files already exist in the HCIS assets folder with' 'Red'
    Say 'different contents, and copying would replace them:' 'Red'
    $clash | ForEach-Object { Say "  $($_.Name)" 'Red' }
    Say 'Tell me before going further. Nothing has been changed.' 'Red'
    exit 1
}

# ---- back up -------------------------------------------------------------
$stamp  = Get-Date -Format 'yyyyMMdd_HHmmss'
$backup = Join-Path $Root ("wwwroot_before_nars_{0}" -f $stamp)
Copy-Item -LiteralPath $site -Destination $backup -Recurse -Force
$n = (Get-ChildItem $backup -Recurse -File).Count
Say ("Backup: {0}  ({1} files)" -f $backup, $n) 'Green'

# ---- record what HCIS looks like, to prove it is untouched ---------------
$cfg = Join-Path $site 'config.js'
$cfgBefore = if (Test-Path $cfg) { (Get-FileHash $cfg).Hash } else { $null }
$idxBefore = (Get-FileHash (Join-Path $site 'index.html')).Hash

# ---- copy ----------------------------------------------------------------
Write-Host ''
Say 'Copying NARS in...'
New-Item -ItemType Directory -Path (Join-Path $site 'nars') -Force | Out-Null
Copy-Item (Join-Path $source 'wwwroot\nars\index.html') (Join-Path $site 'nars\index.html') -Force
Copy-Item (Join-Path $source 'wwwroot\assets\*') (Join-Path $site 'assets\') -Force
Say ("Copied the NARS page and {0} supporting files." -f $incoming.Count) 'Green'

# ---- prove HCIS is untouched --------------------------------------------
Write-Host ''
$cfgAfter = if (Test-Path $cfg) { (Get-FileHash $cfg).Hash } else { $null }
$idxAfter = (Get-FileHash (Join-Path $site 'index.html')).Hash

if ($cfgBefore -ne $cfgAfter) { Say 'config.js CHANGED - it should not have. Tell me.' 'Red'; exit 1 }
if ($idxBefore -ne $idxAfter) { Say "HCIS's index.html CHANGED - it should not have. Tell me." 'Red'; exit 1 }
Say "HCIS untouched: its index.html and config.js are byte for byte as before." 'Green'

Write-Host ''
Rule
Say 'NARS is installed.' 'Green'
Write-Host ''
Say 'Open it at the same address as HCIS with /nars on the end, e.g.' 'Yellow'
Say '  http://localhost/nars/' 'Yellow'
Write-Host ''
Say 'Sign in with a GOVERNMENT BOX account - whatever gets you into HCIS' 'Yellow'
Say 'on THIS machine. It will NOT accept an account from the office server:' 'Yellow'
Say 'the two installations have separate databases and separate accounts.' 'Yellow'
Write-Host ''
Say 'An assessor account will see the assessment screens. On this box the'
Say 'two assessor accounts (m.albert, s.confiance) are switched off, so they'
Say 'need enabling before anyone can carry out an assessment here.'
Write-Host ''
Say 'A completed and released assessment then appears in HCIS under Needs'
Say 'Assessment. That link is already in place from the catch-up.'
Write-Host ''
Say ("If anything is wrong, the previous site is at: {0}" -f $backup)
Rule
Write-Host ''
exit 0
