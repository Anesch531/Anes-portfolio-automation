# Fires 6 classification fixtures through the tunnel. Usage:
#   powershell -File tests\run-fixtures-v2.ps1
param(
    [string]$Key = $env:ALCHEMY_SIGNING_KEY,
    [string]$Url = "http://localhost:5678/webhook/smart-money/v1/REPLACE_WITH_YOUR_SECRET_PATH"
)
if (-not $Key) { throw "Set ALCHEMY_SIGNING_KEY environment variable first." }
if ($Url -like '*REPLACE*') { throw "Set -Url to your production webhook path." }
$ErrorActionPreference = 'Stop'
$W2   = '0x9B864dDE6ED1c21608b1665a0ac0fAA4F7E36e6E'
$W26  = '0x268448f31594F4636D03cBB4E813b94801E47643'
$UR   = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'
$WETH = '0xC02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
$USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
$USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
$PEPE = '0x6982508145454ce325ddbe47a25d4ec3d2311933'
$EOA  = '0x00000000deadbeef00000000deadbeef00000abc'

function Leg($from,$to,$val,$asset,$contract,$dec) {
    @{ fromAddress=$from; toAddress=$to; value=$val; asset=$asset; decimals=$dec;
       category=$(if($contract){'erc20'}else{'external'});
       rawContract=@{ address=$contract; decimals=$dec } }
}
function Fire($name,$legs) {
    $h = '0x' + (-join ((1..40) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) }))
    foreach ($l in $legs) { $l.hash = $h }
    $body = @{ webhookId='wh_fixture'; id=('fx_'+$name); type='ADDRESS_ACTIVITY'; status='live';
        event=@{ network='ETH_MAINNET'; activity=$legs } } | ConvertTo-Json -Depth 8 -Compress
    $hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Key))
    $sig = ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))) -replace '-','').ToLower()
    $r = Invoke-WebRequest -Uri $Url -Method Post -Body $body -ContentType 'application/json' -Headers @{ 'X-Alchemy-Signature' = $sig } -TimeoutSec 20 -UseBasicParsing
    "{0,-14} txHash={1} HTTP {2}" -f $name, $h.Substring(0,14), $r.StatusCode
}

Fire 'BUY'          @((Leg $W2 $UR 400 'WETH' $WETH 18), (Leg $UR $W2 42000000000 'PEPE' $PEPE 18))
Start-Sleep -Seconds 2
Fire 'SELL'         @((Leg $W2 $UR 10000000000 'PEPE' $PEPE 18), (Leg $UR $W2 320000 'USDC' $USDC 6))
Start-Sleep -Seconds 2
Fire 'AIRDROP'      @((Leg $EOA $W2 5000000 'JUNK' $PEPE 18))
Start-Sleep -Seconds 2
Fire 'SELF-TRANSFER'@((Leg $W26 $W2 50 'WETH' $WETH 18))
Start-Sleep -Seconds 2
Fire 'STABLE-SWAP'  @((Leg $W2 $UR 50000 'USDC' $USDC 6), (Leg $UR $W2 49999 'USDT' $USDT 6))
Start-Sleep -Seconds 2
Fire 'UNLISTED-BUY' @((Leg $W2 $UR 300 'WETH' $WETH 18), (Leg $UR $W2 1000000 'NEWGEM' $null 18))
"Fired 6 fixtures - now inspecting executions..."
