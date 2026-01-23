# 🚀 Admin API - Start Here (2 Minutes)

## Step 1: Create Your Admin Secret
```bash
npm run admin:create-secret
```
- Email: your@email.com
- Name: Postman
- Copy the secret that appears

## Step 2: Add to Postman
1. Open Postman
2. Import: `postman-collection-v2.json`
3. Set environment variable `ADMIN_SECRET` = your secret

## Step 3: Test
Click **Send** on any request. Done! ✅

---

## Quick Reference

```bash
# Create secret
npm run admin:create-secret

# List your secrets
npm run admin:secret:list

# Revoke a secret
npm run admin:secret:revoke
```

---

## Available Endpoints

All in Postman. Some examples:

```
GET    /admin/health              # System status
GET    /admin/users               # List users
PATCH  /admin/users/{id}/role     # Change role
POST   /admin/users/{id}/suspend  # Suspend
DELETE /admin/sessions/{id}       # Revoke session
PATCH  /admin/subscriptions/{id}/status  # Update sub
GET    /admin/audit-logs          # View logs
```

Full list in `ADMIN_SECRETS_SETUP.md`

---

## How It Works

1. **Create secret** → Gets personal access key
2. **Use in Postman** → Add to Authorization header
3. **Make requests** → All actions logged with your name
4. **Revoke anytime** → Secret stops working instantly

---

## Why Personal Secrets?

**Before:**
- Everyone shared ONE secret = risky
- Can't see who did what
- Can't revoke per-person

**Now:**
- Each you gets OWN secret
- Full audit trail (who did what & when)
- Revoke individually

---

## Need More Info?

- `ADMIN_SECRETS_SETUP.md` - Complete guide
- `ADMIN_SECRETS_ARCHITECTURE.md` - How it works
- `postman-collection-v2.json` - All endpoints

---

## That's It!

```bash
npm run admin:create-secret  # 1. Create
# Import Postman collection  # 2. Setup
# Click Send                 # 3. Test
```

Enjoy! 🎉
