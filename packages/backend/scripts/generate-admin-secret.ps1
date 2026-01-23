# Generate a secure Admin Secret Key for Windows
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\generate-admin-secret.ps1

Write-Host "🔐 Generating secure Admin Secret Key..."
Write-Host ""

# Generate 32 random bytes and convert to base64
$bytes = [byte[]]::new(32)
$rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
$rng.GetBytes($bytes)
$SECRET = [Convert]::ToBase64String($bytes)

Write-Host "Your Admin Secret Key (keep this safe!):"
Write-Host ""
Write-Host "ADMIN_SECRET_KEY=$SECRET"
Write-Host ""
Write-Host "Add this to your .env file:"
Write-Host ""
Write-Host "ADMIN_SECRET_KEY=$SECRET"
Write-Host ""
Write-Host "✅ Done! Use this secret in the Authorization header:"
Write-Host "   Authorization: AdminSecret $SECRET"
