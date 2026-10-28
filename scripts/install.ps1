# rauha 설치 (Windows). 이미 있는 것은 건너뛴다. 여러 번 실행해도 된다.
#   irm https://raw.githubusercontent.com/kimvudghk11/rauha/main/scripts/install.ps1 | iex
#   또는 저장소 안에서: powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# 바꿀 수 있는 값: $env:RAUHA_DIR(설치 폴더, 기본 ~\rauha), $env:RAUHA_REPO(저장소 주소)
# 네이티브 명령의 stderr를 오류로 보지 않게(출력을 파일로 돌려도 멈추지 않게) Continue로 두고 종료 코드로 판단한다.
$ErrorActionPreference = 'Continue'

$RauhaDir = if ($env:RAUHA_DIR) { $env:RAUHA_DIR } else { Join-Path $HOME 'rauha' }
$RauhaRepo = if ($env:RAUHA_REPO) { $env:RAUHA_REPO } else { 'https://github.com/kimvudghk11/rauha.git' }
$NodeMin = 22
# corepack이 Yarn을 처음 받을 때 묻지 않게.
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'

function Step($text) { Write-Host "`n> $text" -ForegroundColor Cyan }
function Skip($text) { Write-Host "  v $text - 이미 있어서 건너뛰어요" }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Node-Major { if (Have node) { [int]((node -v).TrimStart('v').Split('.')[0]) } else { 0 } }
function Winget-Install($id) {
  if (-not (Have winget)) { throw "winget이 없어요. Microsoft Store에서 '앱 설치 관리자'를 설치한 뒤 다시 실행하세요." }
  winget install -e --id $id --accept-source-agreements --accept-package-agreements
  Refresh-Path
}

Step 'Git'
if (Have git) { Skip "Git $((git --version) -replace 'git version ', '')" } else { Winget-Install 'Git.Git' }

Step "Node.js $NodeMin 이상 (24 LTS 권장)"
if ((Node-Major) -ge $NodeMin) { Skip "Node $(node -v)" }
elseif (Have nvm) {
  # nvm-windows를 쓰는 PC는 nvm으로 깐다(winget으로 따로 깔면 서로 부딪힌다).
  nvm install 24.22.1
  nvm use 24.22.1
  Refresh-Path
}
else { Winget-Install 'OpenJS.NodeJS.LTS' }

Step 'Yarn (corepack)'
if ((Have yarn) -and ((cmd /c 'yarn --version 2>nul') -ne $null)) { Skip "Yarn $(cmd /c 'yarn --version')" }
else {
  # Program Files에 깔린 Node는 관리자 권한 없이 corepack 바로가기를 못 만들어서, 사용자 폴더(%APPDATA%\npm)에 만든다.
  $shimDir = Join-Path $env:APPDATA 'npm'
  New-Item -ItemType Directory -Force $shimDir | Out-Null
  try { corepack enable } catch { corepack enable --install-directory $shimDir }
  if (-not (([Environment]::GetEnvironmentVariable('Path', 'User')) -split ';' | Where-Object { $_ -ieq $shimDir })) {
    [Environment]::SetEnvironmentVariable('Path', ([Environment]::GetEnvironmentVariable('Path', 'User') + ";$shimDir"), 'User')
  }
  Refresh-Path
}

Step 'Claude Code (rauha login에 필요)'
if (Have claude) { Skip "Claude Code $((claude --version) -split ' ' | Select-Object -First 1)" }
else {
  Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
  Refresh-Path
}

Step "rauha 내려받기 ($RauhaDir)"
if (Test-Path (Join-Path $RauhaDir '.git')) {
  Skip 'rauha 저장소'
  git -C $RauhaDir pull --ff-only
  if ($LASTEXITCODE -ne 0) { Write-Host '  ! 새 커밋을 받지 못했어요(바뀐 파일이 있을 수 있어요). 지금 있는 것으로 계속해요.' }
}
else {
  git clone $RauhaRepo $RauhaDir
  if ($LASTEXITCODE -ne 0) { throw 'rauha를 내려받지 못했어요.' }
}

Step '의존성 설치와 빌드 (이미 설치돼 있으면 빠르게 끝나요)'
Push-Location $RauhaDir
try {
  corepack yarn install
  if ($LASTEXITCODE -ne 0) { throw 'yarn install에 실패했어요.' }
  corepack yarn build
  if ($LASTEXITCODE -ne 0) { throw 'yarn build에 실패했어요.' }

  Step '어느 폴더에서든 rauha로 부르기'
  node packages\cli\dist\main.js setup
  if ($LASTEXITCODE -ne 0) { Write-Host '  ! PATH에 있는 폴더를 찾지 못했어요. 위 안내대로 PATH에 더해 주세요.' }
}
finally { Pop-Location }

Write-Host "`n설치를 마쳤어요. 새 터미널을 열고:" -ForegroundColor Green
Write-Host '  rauha login                 # Claude 계정 로그인 (처음 한 번)'
Write-Host '  cd <프로젝트 폴더>; rauha     # 대화 모드'
Write-Host '회사 계정을 따로 쓰려면 ~\.rauha\config.toml에 프로필을 적고 rauha login --profile <이름>을 하세요(README 참고).'
