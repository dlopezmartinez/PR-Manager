# Admin API Testing Guide

This guide explains how to test the Admin API endpoints using the **Admin Secret** method.

## Setup

### 1. Configure Admin Secret

Set the `ADMIN_SECRET_KEY` in your `.env` file:

```env
ADMIN_SECRET_KEY="your-super-secret-admin-key-change-this"
```

For development, you can use any string you want. For production, use a strong random key.

### 2. Using Admin Secret in Requests

All admin endpoints (`/admin/*`) can be accessed by providing the Admin Secret in the Authorization header:

```
Authorization: AdminSecret your-super-secret-admin-key-change-this
```

## Testing with cURL

### List Users

```bash
curl -X GET "http://localhost:3001/admin/users" \
  -H "Authorization: AdminSecret your-super-secret-admin-key-change-this"
```

### Get System Health

```bash
curl -X GET "http://localhost:3001/admin/health" \
  -H "Authorization: AdminSecret your-super-secret-admin-key-change-this"
```

### Change User Role

```bash
curl -X PATCH "http://localhost:3001/admin/users/{userId}/role" \
  -H "Authorization: AdminSecret your-super-secret-admin-key-change-this" \
  -H "Content-Type: application/json" \
  -d '{"role":"ADMIN"}'
```

### Suspend User

```bash
curl -X POST "http://localhost:3001/admin/users/{userId}/suspend" \
  -H "Authorization: AdminSecret your-super-secret-admin-key-change-this" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Account suspended by admin"}'
```

## Testing with Postman

### Import the Collection

1. Open Postman
2. Click **Import** → **Raw text**
3. Paste the collection JSON (see `postman-collection.json`)
4. Click **Import**

### Set Environment Variables

1. Create a new Environment called "Admin Testing"
2. Add these variables:
   - `API_URL`: `http://localhost:3001`
   - `ADMIN_SECRET`: `your-super-secret-admin-key-change-this`
   - `USER_ID`: (leave blank, will be set when testing)

3. Select the environment when running requests

### Using Pre-request Scripts

The collection includes pre-request scripts that automatically:
- Add the Admin Secret header
- Format JSON bodies
- Parse responses

## Endpoint Examples

### Users Management

#### List all users
- **GET** `/admin/users?page=1&limit=25&role=USER&search=email@example.com`
- Query parameters: `page`, `limit`, `role`, `isActive`, `isSuspended`, `search`

#### Get user details
- **GET** `/admin/users/{userId}`

#### Change user role
- **PATCH** `/admin/users/{userId}/role`
- Body: `{"role":"ADMIN"}` (USER, ADMIN, or SUPERUSER)

#### Suspend user
- **POST** `/admin/users/{userId}/suspend`
- Body: `{"reason":"Reason for suspension"}`

#### Unsuspend user
- **POST** `/admin/users/{userId}/unsuspend`

#### Delete user
- **DELETE** `/admin/users/{userId}`

### Sessions Management

#### List all sessions
- **GET** `/admin/sessions?page=1&limit=25`

#### Get user sessions
- **GET** `/admin/sessions/user/{userId}`

#### Revoke session
- **DELETE** `/admin/sessions/{sessionId}`

#### Revoke all user sessions
- **DELETE** `/admin/sessions/user/{userId}/all`

### Subscriptions Management

#### List subscriptions
- **GET** `/admin/subscriptions?page=1&limit=25&status=active`

#### Get subscription details
- **GET** `/admin/subscriptions/{subscriptionId}`

#### Update subscription status
- **PATCH** `/admin/subscriptions/{subscriptionId}/status`
- Body: `{"status":"active"}` (on_trial, active, paused, past_due, unpaid, cancelled, expired)

### Webhooks Management

#### List webhooks
- **GET** `/admin/webhooks?page=1&limit=25&processed=false`

#### Get webhook details
- **GET** `/admin/webhooks/{webhookId}`

#### Retry webhook
- **POST** `/admin/webhooks/{webhookId}/retry`

### Audit Logs

#### List audit logs
- **GET** `/admin/audit-logs?page=1&limit=25&action=USER_SUSPENDED`
- Query parameters: `action`, `performedBy`, `targetUserId`, `startDate`, `endDate`

### System Configuration

#### List all config
- **GET** `/admin/config`

#### Get config value
- **GET** `/admin/config/{key}`

#### Create/Update config
- **POST** `/admin/config`
- Body: `{"key":"my-key","value":{"foo":"bar"}}`

#### Delete config
- **DELETE** `/admin/config/{key}`

### System Health

#### Get health status
- **GET** `/admin/health`

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-23T...",
  "database": { "connected": true, "checkTime": "5ms" },
  "users": { "total": 5, "active": 4, "suspended": 1, "admin": 1, "superuser": 1 },
  "sessions": { "active": 2 },
  "subscriptions": { "active": 3, "trial": 1, "cancelled": 0, "total": 4 },
  "webhooks": { "processed": 10, "pending": 0, "failed": 2, "total": 12 },
  "auditLogs": { "total": 25 },
  "uptime": 3600,
  "memory": { ... },
  "environment": "development"
}
```

## Two Authentication Methods

### Method 1: Admin Secret (Testing/Development)

```
Authorization: AdminSecret your-admin-secret-key
```

**When to use:**
- Testing endpoints with Postman
- Development work
- CI/CD automation
- Before frontend is ready

**Pros:**
- No need for user account
- Direct access to all endpoints
- Easy to test

**Cons:**
- Only for development/testing
- Less security (single secret)

### Method 2: JWT + SUPERUSER Role (Production)

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**When to use:**
- Production deployment
- User-authenticated access
- App usage through UI

**Requirements:**
- User must have SUPERUSER role
- Valid JWT token
- Token must not be expired

**Pros:**
- Proper authentication/authorization
- User-specific audit logs
- Production-ready

**Cons:**
- Requires setting up users
- More complex setup

## Security Best Practices

1. **Development Only**: Use Admin Secret only during development
2. **Strong Key**: Generate a strong random key for production (if needed at all)
3. **Environment Variables**: Never commit secrets to git
4. **Rotation**: Change the secret regularly
5. **Disable in Production**: Consider setting `ADMIN_SECRET_KEY` to empty in production
6. **HTTPS**: Always use HTTPS in production
7. **Logging**: All admin actions are logged in the audit trail

## Troubleshooting

### "Invalid admin secret"

The secret in the Authorization header doesn't match the `ADMIN_SECRET_KEY` env var.

**Solution:** Check that both match exactly.

### "Admin access required"

Neither admin secret nor JWT auth with SUPERUSER role provided.

**Solution:**
- Use `Authorization: AdminSecret your-key` for testing
- Or authenticate with JWT token from a SUPERUSER user

### "Authorization header required"

Missing Authorization header entirely.

**Solution:** Add the Authorization header to your request.

## Testing Workflow

1. Start the backend: `npm run dev`
2. Get your `ADMIN_SECRET_KEY` from `.env`
3. Use cURL or Postman with examples above
4. Test all CRUD operations for each resource
5. Verify audit logs are being created
6. Check health endpoint for system status

## Example Testing Sequence

```bash
# 1. Check system health
curl -X GET "http://localhost:3001/admin/health" \
  -H "Authorization: AdminSecret your-key"

# 2. List users
curl -X GET "http://localhost:3001/admin/users" \
  -H "Authorization: AdminSecret your-key"

# 3. Get first user's ID, then get details
curl -X GET "http://localhost:3001/admin/users/{userId}" \
  -H "Authorization: AdminSecret your-key"

# 4. Change role
curl -X PATCH "http://localhost:3001/admin/users/{userId}/role" \
  -H "Authorization: AdminSecret your-key" \
  -H "Content-Type: application/json" \
  -d '{"role":"ADMIN"}'

# 5. View audit log of the change
curl -X GET "http://localhost:3001/admin/audit-logs?targetUserId={userId}" \
  -H "Authorization: AdminSecret your-key"

# 6. Check health again
curl -X GET "http://localhost:3001/admin/health" \
  -H "Authorization: AdminSecret your-key"
```

This workflow tests user management, role changes, and audit logging end-to-end.
