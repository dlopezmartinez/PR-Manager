# Admin Secrets - Personal Access Keys for Superusers

## 🚀 Quick Start (3 Steps)

### Step 1: Generate Your Secret
```bash
npm run admin:create-secret
```

Then answer the prompts:
- **Email**: your@email.com
- **Name**: Postman (or whatever you want)

✅ You'll get a secret like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### Step 2: Import Postman Collection
1. Open Postman
2. **Import** → **Upload Files** → `postman-collection-v2.json`
3. Create an environment or edit existing one
4. Add variable: `ADMIN_SECRET` = your secret from Step 1

### Step 3: Test
1. Select your environment in Postman
2. Go to System → Health Check
3. Click **Send**
4. ✅ If you see system metrics, you're done!

---

## 📋 What is This?

Instead of ONE global secret, each SUPERUSER gets their **own personal secret**:

- **Before**: Everyone shared `ADMIN_SECRET_KEY`
- **Now**: You have `my-postman-secret-xyz` and your colleague has `their-ci-secret-abc`

Benefits:
✅ Each admin has their own secret
✅ Track who did what (audit logs)
✅ Revoke individual secrets
✅ No shared credentials

---

## 🎮 Available Commands

### Create a New Secret
```bash
npm run admin:create-secret
```
- Enter email and name
- Get your secret
- Use it in Postman/curl

### List Your Secrets
```bash
npm run admin:secret:list
```
- See all your secrets
- Check if they're active/revoked
- See last used date

### Revoke a Secret
```bash
npm run admin:secret:revoke
```
- List your active secrets
- Choose one to revoke
- Confirm
- That secret stops working immediately

---

## 📚 Using Postman

### Setup (One Time)

1. **Import Collection**
   - Postman → Import → `postman-collection-v2.json`

2. **Create Environment**
   - Click environment icon (top right)
   - New
   - Name it "Admin"
   - Add variables:
     - `API_URL` = `http://localhost:3001`
     - `ADMIN_SECRET` = your secret from Step 1

3. **Select Environment**
   - Top right, select "Admin"

### Making Requests

**Every request automatically includes your secret:**
```
Header: Authorization: AdminSecret {{ADMIN_SECRET}}
```

Just click Send on any endpoint!

### Copy IDs to Test

1. Run "List Users"
2. Copy a user ID from response
3. Paste into `{{USER_ID}}` variable
4. Now you can test "Get User Details", "Suspend User", etc.

---

## 🛠️ Using cURL

```bash
# Test health
curl -X GET http://localhost:3001/admin/health \
  -H "Authorization: AdminSecret your-secret-here"

# List users
curl -X GET http://localhost:3001/admin/users \
  -H "Authorization: AdminSecret your-secret-here"

# Suspend user
curl -X POST http://localhost:3001/admin/users/{id}/suspend \
  -H "Authorization: AdminSecret your-secret-here" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Test"}'
```

---

## 🔐 Security Notes

✅ **Safe**: Each secret is hashed in database (like passwords)
✅ **Personal**: Only you know your secret
✅ **Revocable**: Revoke any time with `npm run admin:secret:revoke`
✅ **Trackable**: Audit logs show which secret was used

⚠️ **Keep Secret Safe**:
- Don't commit to git
- Don't share with others
- If someone asks: say "no"

---

## 📖 Endpoint Reference

All available in Postman collection. Quick list:

### Users
- `GET /admin/users` - List all
- `GET /admin/users/{id}` - Get one
- `PATCH /admin/users/{id}/role` - Change role
- `POST /admin/users/{id}/suspend` - Suspend
- `POST /admin/users/{id}/unsuspend` - Reactivate
- `DELETE /admin/users/{id}` - Delete

### Sessions
- `GET /admin/sessions` - List all
- `GET /admin/sessions/user/{id}` - User's sessions
- `DELETE /admin/sessions/{id}` - Revoke one
- `DELETE /admin/sessions/user/{id}/all` - Revoke all

### Subscriptions
- `GET /admin/subscriptions` - List all
- `PATCH /admin/subscriptions/{id}/status` - Update status

### Webhooks
- `GET /admin/webhooks` - List all
- `POST /admin/webhooks/{id}/retry` - Retry failed

### Audit Logs
- `GET /admin/audit-logs` - View all logs

### Config
- `GET /admin/config` - Get all
- `POST /admin/config` - Create/update
- `DELETE /admin/config/{key}` - Delete

### System
- `GET /admin/health` - System status

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Invalid admin secret" | Check secret matches exactly. Regen if needed. |
| "Authorization required" | Make sure you're sending header. Check Postman env. |
| "User not found" | Verify email is correct and user exists |
| Secret won't generate | Make sure user exists and has SUPERUSER role |

---

## 🔄 Migrating Later

If you eventually want JWT auth instead of secrets:
- Create users with SUPERUSER role
- They log in normally to app
- Use JWT token instead of secret
- Secrets still work as backup

No rush - secrets are perfectly fine for solo dev!

---

## 📝 Example Workflow

```
1. npm run admin:create-secret
   ↓
   Email: daniel@example.com
   Name: Postman
   Secret: abc123def456...

2. Paste secret in Postman {{ADMIN_SECRET}}

3. GET /admin/health → ✅ Works!

4. GET /admin/users → See list

5. Copy user ID: user_12345

6. Paste in {{USER_ID}}

7. POST /admin/users/user_12345/suspend
   ↓
   ✅ User suspended

8. GET /admin/audit-logs → See your action logged!
```

---

## ✨ That's It!

You now have:
- ✅ Personal admin secret
- ✅ Postman collection ready
- ✅ Full auditing
- ✅ Easy revocation

Start testing! 🚀
