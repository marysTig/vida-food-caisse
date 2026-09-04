$url = "https://jmetlepihmkgvlvyeyph.supabase.co"
$key = "sb_publishable_U4LBFI-Wu8TIPoXfQzRsGw_jzm726YW"

$headers = @{
    apikey        = $key
    Authorization = "Bearer $key"
    "Content-Type" = "application/json"
    Accept        = "application/json"
}

# Supabase expose pg_publication_tables via la vue postgres meta
# On peut aussi tenter via realtime.messages (table systeme)
# Mais le moyen direct est via l'endpoint /rest/v1/rpc

# On cree une requete pour la vue _realtime.pg_publication_tables si disponible
# Sinon on essaie via un endpoint specifique

Write-Output "=== Verification via API Supabase Realtime Status ==="

# Tentative via realtime/v1/channels (liste des channels actifs)
try {
    $r = Invoke-RestMethod `
        -Uri "$url/realtime/v1/channels" `
        -Headers $headers `
        -Method GET `
        -ErrorAction Stop
    Write-Output "Channels actifs:"
    $r | ConvertTo-Json
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Output "  /realtime/v1/channels -> HTTP $code"
}

Write-Output ""
Write-Output "=== Verification directe via Postgres RPC (si la fonction existe) ==="

# Appel RPC avec une fonction integree Supabase
$body = '{"query": "select tablename from pg_publication_tables where pubname = ''supabase_realtime'' order by tablename"}'

try {
    $r2 = Invoke-RestMethod `
        -Uri "$url/rest/v1/rpc/query" `
        -Headers $headers `
        -Method POST `
        -Body $body `
        -ErrorAction Stop
    Write-Output "Resultat:"
    $r2 | ConvertTo-Json
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    $body2 = $null
    try { $body2 = $_.Exception.Response | Select-Object -ExpandProperty Content } catch {}
    Write-Output "  /rpc/query -> HTTP $code"
    if ($body2) { Write-Output "  Body: $body2" }
}

Write-Output ""
Write-Output "=== Test Realtime WebSocket handshake ==="
# Verifier si le endpoint realtime repond (wss -> https pour HEAD check)
try {
    $r3 = Invoke-WebRequest `
        -Uri "$url/realtime/v1/websocket?apikey=$key&vsn=1.0.0" `
        -Method GET `
        -Headers @{ "Upgrade" = "websocket" } `
        -ErrorAction Stop
    Write-Output "WebSocket repondu: $($r3.StatusCode)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Output "  WebSocket test -> HTTP $code (101 = OK upgrade, autre = probleme)"
}
