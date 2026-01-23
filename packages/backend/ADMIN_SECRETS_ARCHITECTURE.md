# Admin Secrets Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN API REQUEST                        │
│  Authorization: AdminSecret your-personal-secret-key        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
          ┌──────────────────────────────────┐
          │  requireAdminSecret Middleware   │
          └──────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
   Secret Valid?                    Secret Invalid?
        │                                 │
        ├─ Hash the secret               │
        │                                 │
        ├─ Look up in AdminSecret table   │
        │                                 │
        ├─ Check if revoked?              │
        │                                 │
        ├─ Update lastUsedAt              │
        │                                 │
        ├─ Set req.user with userId      │
        │                                 │
        └─ req.adminSecretValid = true    └─→ 401 Unauthorized
                 │
                 ▼
    ┌────────────────────────────────┐
    │    Access Granted               │
    │    Route Handler Executes       │
    │    req.user = {                 │
    │      userId: "...",             │
    │      email: "...",              │
    │      role: "SUPERUSER"          │
    │    }                            │
    │    req.secretName = "Postman"   │
    └────────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────┐
    │    Action Performed             │
    │    e.g., Suspend User           │
    │                                │
    │    logAudit({                  │
    │      action: 'USER_SUSPENDED'  │
    │      performedBy: userId       │
    │      secretName: 'Postman'     │
    │    })                          │
    └────────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────┐
    │   Audit Log Created            │
    │   "daniel@example.com used     │
    │    Postman secret and suspended
    │    user@example.com"           │
    └────────────────────────────────┘
```

---

## Database Tables

### Users (existing)
```sql
id          | email              | role       | ...
─────────────────────────────────────────────
user_1      | daniel@example.com | SUPERUSER  |
user_2      | alice@example.com  | SUPERUSER  |
user_3      | bob@example.com    | USER       |
```

### AdminSecrets (NEW)
```sql
id          | userId  | secretHash (SHA256)        | name     | revoked_at | last_used_at
─────────────────────────────────────────────────────────────────────────────────────
secret_1    | user_1  | a1b2c3d4e5f6...            | Postman  | NULL       | 2026-01-23
secret_2    | user_1  | f6e5d4c3b2a1...            | CI/CD    | NULL       | 2026-01-22
secret_3    | user_2  | 9z8y7x6w5v4u...            | Local    | 2026-01-20 | 2026-01-20
```

### AuditLogs (existing, now with secret info)
```sql
id      | action          | performed_by | target_user_id | metadata                     | ...
──────────────────────────────────────────────────────────────────────────────────────────
log_1   | USER_SUSPENDED  | user_1       | user_3         | {secretName: "Postman", ...} |
log_2   | USER_DELETED    | user_2       | user_3         | {secretName: "CI/CD", ...}   |
```

---

## Secret Creation Flow

```bash
$ npm run admin:create-secret

┌────────────────────────────────────┐
│  User Input                        │
│  - Email: daniel@example.com       │
│  - Name: Postman                   │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  1. Verify User Exists             │
│  2. Check Role = SUPERUSER         │
│  3. Generate Random Secret         │
│     a1b2c3d4e5f6g7h8i9j0k1l2m3n4   │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Hash Secret (SHA256)              │
│  a1b2... → 8f4d9c2a1e3b...         │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Store in AdminSecrets Table       │
│  - userId: user_1                  │
│  - secretHash: 8f4d9c2a1e3b...     │
│  - name: "Postman"                 │
│  - createdAt: now()                │
│  - revokedAt: NULL                 │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Return Plain Secret (ONE TIME!)   │
│  "a1b2c3d4e5f6g7h8i9j0k1l2m3n4"    │
│                                    │
│  ⚠️  NOT STORED ANYWHERE ELSE      │
│  ⚠️  ONLY HASH IS IN DATABASE      │
│  ⚠️  SAVE IT NOW OR LOSE IT        │
└────────────────────────────────────┘
```

---

## Secret Validation Flow

```
Request Header:
Authorization: AdminSecret a1b2c3d4e5f6g7h8i9j0k1l2m3n4

         │
         ▼
┌────────────────────────────────────┐
│  Middleware: requireAdminSecret    │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Extract Secret from Header        │
│  secret = "a1b2c3d4e5f6g7h8..."    │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Hash It                           │
│  hash(secret) = "8f4d9c2a1e3b..."  │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Query AdminSecrets Table          │
│  WHERE secretHash = "8f4d9c2a..."  │
└────────┬───────────────────────────┘
         │
      ┌──┴──┐
      │     │
      ▼     ▼
   Found  Not Found
      │     │
      ▼     ▼
   ┌──┐  ┌─────┐
   │✅│  │ ❌  │
   └──┘  │401  │
      │  └─────┘
      ▼
┌────────────────────────────────────┐
│  Check revoked_at                  │
│  Is NULL? → Continue               │
│  Not NULL? → 401 Revoked           │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Get User Info                     │
│  userId, email, role = SUPERUSER   │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Update lastUsedAt                 │
│  lastUsedAt = now()                │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Set req.user                      │
│  Set req.secretName = "Postman"    │
│  Set req.adminSecretValid = true   │
└────────┬───────────────────────────┘
         │
         ▼
    ✅ Access Granted
```

---

## Revocation Flow

```bash
$ npm run admin:secret:revoke

┌────────────────────────────────────┐
│  List User's Secrets               │
│  Show only non-revoked             │
│  1. Postman (created 2026-01-23)   │
│  2. Local (created 2026-01-22)     │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  User Selects One                  │
│  "1" → Postman                     │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  User Confirms                     │
│  "Revoke Postman? (yes/no)"        │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  Update AdminSecrets Table         │
│  WHERE id = secret_1               │
│  SET revokedAt = now()             │
└────────┬───────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│  ✅ Secret Revoked!                │
│                                    │
│  "Postman" secret now STOPS WORKING│
│  Any request with it gets 401      │
│  Other secrets still work!         │
└────────────────────────────────────┘
```

---

## Comparison: Before vs After

### Before: Global Secret
```
.env:
ADMIN_SECRET_KEY=global-secret-123

Anyone with secret can do anything
❌ No tracking of who did what
❌ Can't revoke per person
❌ Shared credentials = risky
```

### After: Personal Secrets
```
Database AdminSecrets:
user_1 (daniel@):
  - Postman secret (ACTIVE)
  - CI/CD secret (ACTIVE)

user_2 (alice@):
  - Local secret (REVOKED)
  - Postman secret (ACTIVE)

✅ Each user has own secrets
✅ Audit logs show which secret was used
✅ Can revoke individual secrets
✅ No shared credentials
```

---

## Key Points

1. **Plain Secret Generated Once**
   - User gets it once during creation
   - We never see it again
   - Only hash stored in database

2. **Hashed in Database**
   - Like password hashing
   - Even admin can't see the plain secret
   - Can only validate (hash and compare)

3. **Tracked in Audit Logs**
   - Which user did the action
   - Which secret was used (by name)
   - When it was used

4. **Revocable Anytime**
   - Just set `revokedAt` timestamp
   - Old secret stops working immediately
   - Other secrets unaffected

5. **Per-User Secrets**
   - Multiple secrets per user
   - Each with different purpose
   - Independent revocation

---

## Security Model

```
SECRET LIFECYCLE:
1. Generated       → Random 32-byte hex string
2. Hashed         → SHA256 (irreversible)
3. Stored         → Only hash in DB
4. Used           → User sends plain secret in header
5. Validated      → Hash it, compare with DB
6. Tracked        → Log who used it
7. Revocable      → Set revokedAt = now()

NEVER:
❌ Store plain secret
❌ Print secret in logs
❌ Return secret after creation
❌ Use secret as-is (always hash first)
```

---

This system gives you:
- ✅ **Security**: Per-user secrets, hashed storage
- ✅ **Auditability**: Track who did what and with which secret
- ✅ **Control**: Revoke individual secrets instantly
- ✅ **Simplicity**: Just `npm run admin:create-secret`

Perfect for testing and development!
