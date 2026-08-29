# Temporary launcher script - starts backend and frontend dev servers
$root = "c:\Users\Core i5\Desktop\StockPros_Hackathon"

Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev" `
  -WorkingDirectory "$root\backend" `
  -RedirectStandardOutput "$root\backend-dev.log" `
  -RedirectStandardError "$root\backend-dev.err.log" `
  -WindowStyle Hidden

Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev" `
  -WorkingDirectory "$root\frontend" `
  -RedirectStandardOutput "$root\frontend-dev.log" `
  -RedirectStandardError "$root\frontend-dev.err.log" `
  -WindowStyle Hidden

Write-Host "Dev servers launched."
