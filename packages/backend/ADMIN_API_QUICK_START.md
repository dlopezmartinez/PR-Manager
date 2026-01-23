# Admin API - Quick Start

## 🚀 Fast Setup (5 minutes)

### 1. Set Admin Secret in `.env`

```env
ADMIN_SECRET_KEY="my-super-secret-admin-key-123"
```

### 2. Start Backend

```bash
npm run dev
```

### 3. Test with cURL

```bash
curl -X GET "http://localhost:3001/admin/health" \
  -H "Authorization: AdminSecret my-super-secret-admin-key-123"
```

✅ Should return system health metrics

---

## 📬 Import Postman Collection

1. Open Postman
2. Click **Import** → **Upload Files**
3. Select `postman-collection.json` from this folder
4. Create an environment with:
   - `API_URL`: `http://localhost:3001`
   - `ADMIN_SECRET`: `my-super-secret-admin-key-123`

Now you can test all endpoints from Postman!

---

## 🔐 Authorization Header Format

```
Authorization: AdminSecret your-admin-secret-key
```

Replace `your-admin-secret-key` with the value from `ADMIN_SECRET_KEY` in `.env`

---

## 📊 Key Endpoints

### Users
```
GET    /admin/users               # List all users
GET    /admin/users/{id}          # Get user details
PATCH  /admin/users/{id}/role     # Change role
POST   /admin/users/{id}/suspend  # Suspend user
POST   /admin/users/{id}/unsuspend# Unsuspend user
DELETE /admin/users/{id}          # Delete user
```

### Sessions
```
GET    /admin/sessions            # List all sessions
GET    /admin/sessions/user/{id}  # Get user sessions
DELETE /admin/sessions/{id}       # Revoke session
DELETE /admin/sessions/user/{id}/all  # Revoke all user sessions
```

### Health
```
GET    /admin/health              # System status & metrics
```

### More
- **Subscriptions**: `/admin/subscriptions/*`
- **Webhooks**: `/admin/webhooks/*`
- **Audit Logs**: `/admin/audit-logs`
- **Config**: `/admin/config`

See `ADMIN_TESTING.md` for complete documentation.

---

## ✅ Common Tasks

### Get System Status
```bash
curl -X GET "http://localhost:3001/admin/health" \
  -H "Authorization: AdminSecret your-key"
```

### List All Users
```bash
curl -X GET "http://localhost:3001/admin/users?page=1&limit=25" \
  -H "Authorization: AdminSecret your-key"
```

### Suspend a User
```bash
curl -X POST "http://localhost:3001/admin/users/{user_id}/suspend" \
  -H "Authorization: AdminSecret your-key" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Fraudulent activity"}'
```

### Change User Role to Admin
```bash
curl -X PATCH "http://localhost:3001/admin/users/{user_id}/role" \
  -H "Authorization: AdminSecret your-key" \
  -H "Content-Type: application/json" \
  -d '{"role":"ADMIN"}'
```

### View Audit Log
```bash
curl -X GET "http://localhost:3001/admin/audit-logs?limit=10" \
  -H "Authorization: AdminSecret your-key"
```

---

## 🔍 Postman Tips

1. **Set environment variables** for easy testing
2. **Use {{ADMIN_SECRET}}** in headers - Postman will auto-replace
3. **Copy IDs from list responses** and paste into {{USER_ID}} etc.
4. **Check response status** - Admin operations return 200/201 on success

---

## ⚠️ Important Notes

- Admin Secret is **only for testing/development**
- In production, use JWT authentication with SUPERUSER role
- All actions are logged in audit trail
- Endpoints require `ADMIN_SECRET_KEY` to be set in `.env`
- If `ADMIN_SECRET_KEY` is empty, only JWT auth works

---

## 📚 Full Documentation

See `ADMIN_TESTING.md` for complete API documentation.

---

## 🐛 Troubleshooting

**"Invalid admin secret"** → Check secret matches in `.env` and header exactly

**"Admin access required"** → Use correct header format: `Authorization: AdminSecret your-key`

**"Authorization header required"** → Always include the Authorization header

---

Done! You can now test the entire Admin API without frontend setup. 🎉
