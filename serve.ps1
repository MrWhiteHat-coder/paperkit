# Runs PaperKit on your own computer. No install, no Node, no Python: just Windows PowerShell.
#   powershell -ExecutionPolicy Bypass -File serve.ps1
param([int]$Port = 4173, [string]$Root = (Join-Path $PSScriptRoot 'public'), [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript'; '.mjs' = 'text/javascript'; '.css' = 'text/css'
  '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.wasm' = 'application/wasm'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.woff2' = 'font/woff2'; '.ttf' = 'font/ttf'; '.txt' = 'text/plain'
}
$rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
  try { $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add("http://localhost:$p/"); $listener.Start(); $Port = $p; break }
  catch { $listener = $null }
}
if (-not $listener) { Write-Host 'Could not find a free port.' -ForegroundColor Red; exit 1 }
$url = "http://localhost:$Port/"
Write-Host ''
Write-Host "  PaperKit is running at $url" -ForegroundColor Green
Write-Host '  Your files never leave this computer. Press Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''
if (-not $NoOpen) { Start-Process $url }
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/').Replace('/', '\')
      # only answer requests addressed to this computer (blocks DNS-rebinding tricks from other websites)
      $hostName = ($ctx.Request.Headers['Host'] -replace ':\d+$', '').ToLower()
      if ($hostName -notin @('localhost', '127.0.0.1', '[::1]')) { $ctx.Response.StatusCode = 403; continue }
      if ($ctx.Request.HttpMethod -notin @('GET', 'HEAD')) { $ctx.Response.StatusCode = 405; continue }
      $file = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))
      if (-not $file.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase) -and ($file + '\') -ne $rootFull) { $ctx.Response.StatusCode = 403; continue }
      if (Test-Path $file -PathType Container) { $file = Join-Path $file 'index.html' }
      if (-not (Test-Path $file -PathType Leaf)) {
        if ([System.IO.Path]::GetExtension($rel)) { $ctx.Response.StatusCode = 404; continue }
        $file = Join-Path $rootFull 'index.html'   # deep links like /merge open the app
      }
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
      $ctx.Response.Headers.Add('X-Content-Type-Options', 'nosniff')
      $ctx.Response.Headers.Add('X-Frame-Options', 'DENY')
      $ctx.Response.Headers.Add('Referrer-Policy', 'no-referrer')
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch { } finally { $ctx.Response.Close() }
  }
} finally { $listener.Stop() }
