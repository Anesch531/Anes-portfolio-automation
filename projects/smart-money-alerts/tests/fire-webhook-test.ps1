# Fire test webhook deliveries at the Smart Money Alert v1 workflow.
# Usage: powershell -ExecutionPolicy Bypass -File tests\fire-webhook-test.ps1 [-Key <signingKey>] [-BadSig]
param(
    [string]$Key = "test_signing_key_v1_demo",
    [string]$Url = "http://localhost:5678/webhook/smart-money/v1/smb_9fK3vQ7xTz2pLwR4",
    [switch]$BadSig
)

$ErrorActionPreference = 'Stop'

$body = @'
{"webhookId":"wh_test01","id":"ei_test001","createdAt":"2026-08-24T14:00:00.000Z","type":"ADDRESS_ACTIVITY","version":"2","status":"live","event":{"network":"ETH_MAINNET","activity":[{"category":"external","fromAddress":"0x00000000deadbeef00000000deadbeef00000001","toAddress":"0x9B864dDE6ED1c21608b1665a0ac0fAA4F7E36e6E","blockNum":"0x1500001","hash":"__TXHASH__","value":500,"asset":"ETH","decimals":18}]}}
'@
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rb = New-Object byte[] 32
$rng.GetBytes($rb)
$txHash = '0x' + ([System.BitConverter]::ToString($rb) -replace '-','').ToLower()
$body = $body.Replace('__TXHASH__', $txHash)

$hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Key))
$sig  = ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body.Trim()))) -replace '-','').ToLower()
if ($BadSig) { $sig = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }

$resp = Invoke-WebRequest -Uri $url -Method Post -Body $body.Trim() -ContentType 'application/json' `
    -Headers @{ 'X-Alchemy-Signature' = $sig } -TimeoutSec 20 -UseBasicParsing
Write-Output ("HTTP {0} | body: {1} | sigUsed: {2}" -f $resp.StatusCode, $resp.Content, $(if ($BadSig) {'FORGED'} else {'VALID'}))
