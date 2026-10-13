param([ValidatePattern('^(arm64-v8a|x86_64)(,(arm64-v8a|x86_64))?$')][string]$Architecture = 'arm64-v8a', [switch]$Incremental, [switch]$NoOptimize)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = Split-Path -Parent $projectRoot
$privateRoot = Join-Path $env:USERPROFILE '.dailoop\signing'
$privateConfig = Join-Path $privateRoot 'release-signing.json'
$storeFile = Join-Path $privateRoot 'dailoop-release.p12'
New-Item -ItemType Directory -Force -Path $privateRoot | Out-Null
$principal = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $privateRoot /inheritance:r /grant:r "${principal}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot protect the signing directory.' }
$newSigningIdentity = -not (Test-Path -LiteralPath $privateConfig)
if ($newSigningIdentity) {
  if (Test-Path -LiteralPath $storeFile) { throw 'A signing key exists without its configuration; do not rotate it.' }
  $randomBytes = [byte[]]::new(36)
  [Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
  @{storeFile=$storeFile; alias='dailoop'; password=[Convert]::ToBase64String($randomBytes)} | ConvertTo-Json | Set-Content -LiteralPath $privateConfig -Encoding utf8
}
if (-not $newSigningIdentity -and -not (Test-Path -LiteralPath $storeFile)) {
  throw 'The existing release signing key is missing. Restore its private backup; never regenerate an identity used by installed APKs.'
}
$signing = Get-Content -LiteralPath $privateConfig -Raw | ConvertFrom-Json
if ($signing.storeFile -ne $storeFile -or $signing.alias -ne 'dailoop') { throw 'Unexpected release signing identity; inspect the private configuration.' }
try {
  $env:DAILOOP_BUILD_ARCHITECTURES = $Architecture
  $env:DAILOOP_OPTIMIZE_RELEASE = if ($NoOptimize) { '0' } else { '1' }
  $env:DAILOOP_KEYSTORE_PATH = $storeFile
  $env:DAILOOP_KEYSTORE_PASSWORD = $signing.password
  if (-not (Test-Path -LiteralPath $storeFile)) {
    & keytool.exe -genkeypair -keystore $storeFile -storetype PKCS12 -alias dailoop -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=Dailoop Personal, OU=Dailoop, O=Dailoop' -storepass:env DAILOOP_KEYSTORE_PASSWORD -keypass:env DAILOOP_KEYSTORE_PASSWORD -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Release key generation failed.' }
  }
  # Android batch tools need an alias without !; Gradle/Node keep one canonical project root.
  $mappings = & subst.exe
  $mapping = $mappings | Where-Object { $_ -like 'S:\:*' }
  if ($mapping -and -not $mapping.EndsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Drive S: belongs to another path.' }
  if (-not $mapping) {
    if (Test-Path 'S:\') { throw 'Drive S: is occupied.' }
    & subst.exe S: $workspaceRoot
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the local build path alias.' }
  }
  $env:ANDROID_HOME = 'S:\Dailoop\output\tooling\android-sdk'
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
  # Ninja 1.10 cannot stat dependency paths longer than 260 characters on Windows.
  $gradleCacheRoot = Join-Path $projectRoot 'output\tooling\gradle-cache'
  New-Item -ItemType Directory -Force -Path $gradleCacheRoot | Out-Null
  $cacheMapping = (& subst.exe) | Where-Object { $_ -like 'T:\:*' }
  if ($cacheMapping -and -not $cacheMapping.EndsWith($gradleCacheRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Drive T: belongs to another path.' }
  if (-not $cacheMapping) {
    if (Test-Path 'T:\') { throw 'Drive T: is occupied.' }
    & subst.exe T: $gradleCacheRoot
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the short Gradle cache path.' }
  }
  $env:GRADLE_USER_HOME = 'T:\'
  $env:EXPO_NO_TELEMETRY = '1'
  $env:CI = '1'
  $env:NODE_ENV = 'production'
  if (-not (Test-Path "$env:ANDROID_HOME\platforms\android-36\android.jar")) { throw 'Android SDK 36 is missing.' }
  Push-Location $projectRoot
  try {
    & node scripts/patch-android-blur.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Native palette patch failed.' }
    $prebuildArgs = @('expo', 'prebuild', '--platform', 'android', '--no-install')
    if ($Incremental) { $prebuildArgs += '--no-clean' }
    & npx.cmd @prebuildArgs
    if ($LASTEXITCODE -ne 0) { throw 'Android prebuild failed.' }
    'sdk.dir=S:/Dailoop/output/tooling/android-sdk' | Set-Content -LiteralPath android/local.properties -Encoding ascii
    Push-Location android
    try {
      & ./gradlew.bat :app:assembleRelease "-PreactNativeArchitectures=$Architecture" --console=plain --no-daemon --max-workers=2
      if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' }
    } finally { Pop-Location }
  } finally { Pop-Location }
} finally {
  Remove-Item Env:DAILOOP_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:DAILOOP_KEYSTORE_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:DAILOOP_BUILD_ARCHITECTURES -ErrorAction SilentlyContinue
  Remove-Item Env:DAILOOP_OPTIMIZE_RELEASE -ErrorAction SilentlyContinue
  $signing = $null
}
