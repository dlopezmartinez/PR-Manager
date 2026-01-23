# Admin Secret Setup Guide

## Overview

You now have a **secret-based authentication system** for testing Admin API endpoints. This allows you to:

- ✅ Test all admin endpoints with Postman before the app is live
- ✅ Use cURL or any HTTP client
- ✅ Access endpoints without needing a logged-in SUPERUSER user
- ✅ Quick development and testing workflow
- ✅ CI/CD pipeline testing

## How It Works

```
Your Request
    ↓
Authorization: AdminSecret your-secret-key
    ↓
Backend checks if secret matches ADMIN_SECRET_KEY env var
    ↓
✅ Valid → Access granted to /admin/* endpoints
❌ Invalid → 401 error
```

## Setup Steps

### Option 1: Quick Setup (Manual)

1. Open `.env` in the backend folder
2. Add this line:
   ```env
   ADMIN_SECRET_KEY="my-super-secret-key-12345"
   ```
3. Save and restart the backend
4. Use `my-super-secret-key-12345` in your requests

### Option 2: Generate Secure Secret (Recommended)

**macOS/Linux:**
```bash
cd packages/backend
./scripts/generate-admin-secret.sh
```

**Windows PowerShell:**
```powershell
cd packages/backend
powershell -ExecutionPolicy Bypass -File .\scripts\generate-admin-secret.ps1
```

This generates a random 32-byte secret. Copy the output and add to `.env`:

```env
ADMIN_SECRET_KEY=<paste-generated-secret-here>
```

## Testing

### 1. Test with cURL

```bash
curl -X GET "http://localhost:3001/admin/health" \
  -H "Authorization: AdminSecret your-secret-key"
```

### 2. Test with Postman

1. Import `postman-collection.json`
2. Create environment with:
   - `API_URL`: `http://localhost:3001`
   - `ADMIN_SECRET`: `your-secret-key`
3. Run any request

### 3. Quick Health Check

```bash
# Substitute your actual secret
curl -X GET http://localhost:3001/admin/health \
  -H "Authorization: AdminSecret your-secret-key" | jq
```

## Security Best Practices

### Development
✅ Use ANY string for testing locally
✅ Store in `.env` (never commit to git)
✅ Update frequently

### Before Production
⚠️ Generate strong secret with `generate-admin-secret.sh`
⚠️ Change from default value in `.env.example`
⚠️ Use environment variables, not hardcoded
⚠️ Consider rotating periodically

### Production Decision
🛑 Set `ADMIN_SECRET_KEY` to empty string to DISABLE it
🛑 Use JWT + SUPERUSER role for production access
🛑 Admin Secret should never be exposed publicly

## Header Format

Exact format required:

```
Authorization: AdminSecret your-secret-here
```

❌ Wrong:
```
Authorization: Bearer your-secret-here
Authorization: your-secret-here
Authorization: AdminSecret your-secret-here extra-stuff
```

## Multiple Secrets (Not Supported)

Currently only ONE secret is supported. To "rotate" it:

1. Update `ADMIN_SECRET_KEY` in `.env`
2. Restart backend
3. All old requests will fail until updated

For production, consider:
- Using a secret management system (Vault, AWS Secrets)
- Adding secret versioning
- Using proper JWT tokens instead

## What Endpoints Are Available?

With valid `ADMIN_SECRET`, you can access:

```
/admin/users/*              # User management
/admin/sessions/*           # Session management
/admin/subscriptions/*      # Subscription management
/admin/webhooks/*           # Webhook management
/admin/audit-logs           # Audit log viewing
/admin/config/*             # System configuration
/admin/health               # System health & metrics
```

All endpoints documented in `ADMIN_TESTING.md` and included in Postman collection.

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Invalid admin secret | Secret mismatch | Check secret matches `.env` exactly |
| 403 Admin access required | No auth provided | Add `Authorization: AdminSecret <key>` header |
| Authorization header required | Missing header | Add the Authorization header to request |
| 404 Not found | Wrong endpoint | Check endpoint path (see ADMIN_TESTING.md) |

## Two Authentication Methods

### Method 1: Admin Secret (You Are Here)
- **When**: Testing, development, before launch
- **How**: `Authorization: AdminSecret your-key`
- **Pros**: No user account needed, simple
- **Cons**: Development only, no user context

### Method 2: JWT + SUPERUSER Role
- **When**: Production, app is live
- **How**: User logs in, gets JWT, must have SUPERUSER role
- **Pros**: User-authenticated, secure, audit trail
- **Cons**: More complex setup

The backend supports BOTH at the same time!

## Files Created/Modified

**New Files:**
- `middleware/adminSecret.ts` - Middleware for secret validation
- `postman-collection.json` - Ready-to-import Postman collection
- `ADMIN_TESTING.md` - Complete API documentation
- `ADMIN_API_QUICK_START.md` - Quick reference guide
- `scripts/generate-admin-secret.sh` - macOS/Linux secret generator
- `scripts/generate-admin-secret.ps1` - Windows secret generator

**Modified Files:**
- `routes/admin.ts` - Updated to support admin secret
- `.env.example` - Added ADMIN_SECRET_KEY
- `.env` - (your local file, not committed)

## Next Steps

1. ✅ Add `ADMIN_SECRET_KEY` to `.env`
2. ✅ Start backend: `npm run dev`
3. ✅ Import Postman collection or use cURL
4. ✅ Test endpoints
5. ✅ Check audit logs to verify everything works
6. ⏳ When ready for production: remove/disable the secret

## Questions?

See the full documentation in:
- `ADMIN_TESTING.md` - Complete endpoint reference
- `ADMIN_API_QUICK_START.md` - Quick commands

You're all set! 🚀
