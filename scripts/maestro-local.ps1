# Local Maestro 2.11.0 launcher. No machine/user environment or PATH changes.
# Use the S: workspace alias: the vendor batch launcher does not tolerate ! in paths.
$ErrorActionPreference = 'Stop'
$maestroArguments = $args
$maestroRoot = 'S:\Dailoop\output\tooling\maestro'
$maestroEnvironment = @{
    JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.14.7-hotspot'
    ANDROID_HOME = 'S:\Dailoop\output\tooling\android-sdk'
    ANDROID_SDK_ROOT = 'S:\Dailoop\output\tooling\android-sdk'
    PATH = 'S:\Dailoop\output\tooling\android-sdk\platform-tools;' + [Environment]::GetEnvironmentVariable('PATH', 'Process')
    MAESTRO_CLI_NO_ANALYTICS = 'true'
    MAESTRO_DISABLE_UPDATE_CHECK = 'true'
    MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED = 'true'
    # 2.11.0 ErrorReporter/update fetch do not honor NO_ANALYTICS. Keep their API local.
    # This launcher is for local device tests; Maestro Cloud/login will not work here.
    MAESTRO_API_URL = 'http://127.0.0.1:9'
    XDG_STATE_HOME = "$maestroRoot\state"
    MAESTRO_OPTS = "-Duser.home=$maestroRoot\home"
}
$maestroPreviousEnvironment = @{}
$maestroExitCode = 1
try {
    foreach ($maestroKey in $maestroEnvironment.Keys) {
        $maestroPreviousEnvironment[$maestroKey] = [Environment]::GetEnvironmentVariable($maestroKey, 'Process')
        [Environment]::SetEnvironmentVariable($maestroKey, $maestroEnvironment[$maestroKey], 'Process')
    }
    New-Item -ItemType Directory -Force -Path "$maestroRoot\state", "$maestroRoot\home" | Out-Null
    & "$maestroRoot\bin\maestro.bat" @maestroArguments
    $maestroExitCode = $LASTEXITCODE
} finally {
    foreach ($maestroKey in $maestroPreviousEnvironment.Keys) {
        if ($null -eq $maestroPreviousEnvironment[$maestroKey]) {
            Remove-Item -LiteralPath "Env:\$maestroKey" -ErrorAction SilentlyContinue
        } else {
            [Environment]::SetEnvironmentVariable($maestroKey, $maestroPreviousEnvironment[$maestroKey], 'Process')
        }
    }
}
exit $maestroExitCode

