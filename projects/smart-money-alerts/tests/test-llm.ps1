# Quick sanity test of the LLM endpoint used by the Smart Money workflow.
# Usage: $env:LLM_API_KEY = '<your-key>'; powershell -File tests\test-llm.ps1
param(
    [string]$ApiKey = $env:LLM_API_KEY,
    [string]$BaseUrl = $env:LLM_URL
)
if (-not $ApiKey -or -not $BaseUrl) { throw "Set LLM_API_KEY and LLM_URL environment variables first." }
$ErrorActionPreference = 'Stop'
$payload = @{
    model = 'deepseek-v4-flash'
    messages = @(
        @{ role = 'system';  content = 'You are a helpful assistant.' },
        @{ role = 'user';    content = 'Reply with exactly: OK' }
    )
    stream = $false
} | ConvertTo-Json -Depth 5

$t = Measure-Command {
    $r = Invoke-RestMethod -Uri "$BaseUrl/chat/completions" -Method Post `
        -ContentType 'application/json' `
        -Headers @{ Authorization = "Bearer $ApiKey" } `
        -Body $payload -TimeoutSec 30
}
"latency_ms: $([math]::Round($t.TotalMilliseconds))"
"model: $($r.model)"
"reply: $($r.choices[0].message.content)"
"usage: $($r.usage | ConvertTo-Json -Compress)"
