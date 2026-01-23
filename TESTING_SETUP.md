# Testing Setup & Execution Guide

## Current Status

✅ **All 7 phases implemented:**
1. Backend test infrastructure (vitest, supertest, database cleanup)
2. Backend admin route tests (users, sessions, health, audit logs)
3. Backend security tests (auth, rate limiting, secrets)
4. Frontend tests (adminService, sanitize utilities)
5. Postman collection (API documentation)
6. CI/CD integration (GitHub Actions)
7. E2E tests (Playwright - landing, auth, security, admin)

❌ **Execution Blocked:** Test database not configured

## Prerequisites to Run Tests

### Option 1: Local PostgreSQL (Recommended for Development)

1. **Install PostgreSQL**
   ```bash
   # macOS
   brew install postgresql
   brew services start postgresql

   # Linux (Ubuntu/Debian)
   sudo apt-get install postgresql postgresql-contrib
   sudo systemctl start postgresql

   # Windows
   # Download and install from https://www.postgresql.org/download/windows/
   ```

2. **Create test database**
   ```bash
   createdb pr_manager_test
   ```

3. **Update DATABASE_URL for tests**
   ```bash
   # Create packages/backend/.env.test
   DATABASE_URL="postgresql://postgres@localhost:5432/pr_manager_test"
   JWT_SECRET="test-jwt-secret-key-for-testing-12345"
   DOWNLOAD_SECRET="test-download-secret"
   NODE_ENV="test"
   ```

4. **Run migrations**
   ```bash
   npx prisma migrate deploy
   ```

### Option 2: Docker PostgreSQL (Recommended for CI/CD)

```bash
docker run --name pr-manager-test \
  -e POSTGRES_PASSWORD=testpass \
  -e POSTGRES_DB=pr_manager_test \
  -p 5432:5432 \
  -d postgres:15
```

## Running Tests

### Backend Tests
```bash
# All tests
npm run test -w @pr-manager/backend

# Specific test file
npm test -- tests/routes/admin/users.test.ts

# Watch mode
npm test -- --watch tests/routes/admin/users.test.ts

# With coverage
npm test -- --coverage
```

### Frontend Tests
```bash
# All tests
npm run test -w @pr-manager/app

# Specific test file
npm test -- tests/services/adminService.test.ts

# UI mode
npm run test:ui
```

### E2E Tests
```bash
# All E2E tests (requires dev servers running)
npm run e2e

# UI mode
npm run e2e:ui

# Debug mode
npm run e2e:debug

# Headed mode (see browser)
npm run e2e:headed

# Specific test file
npx playwright test e2e/auth.spec.ts
```

## Test Architecture

### Backend Tests
- **Setup**: `tests/setup.ts` - Database cleanup & initialization
- **Helpers**: `tests/helpers/testHelpers.ts` - User/session creation
- **Routes**: `tests/routes/admin/*.test.ts` - API endpoint tests
- **Middleware**: `tests/middleware/*.test.ts` - Auth & rate limiting
- **Services**: `tests/services/*.test.ts` - Business logic

### Frontend Tests
- **Services**: `tests/services/adminService.test.ts` - API client
- **Utils**: `tests/utils/sanitize.test.ts` - XSS prevention

### E2E Tests
- **Config**: `playwright.config.ts` - Playwright configuration
- **Fixtures**: `e2e/fixtures.ts` - Test helpers & users
- **Landing**: `e2e/landing.spec.ts` - Public page tests
- **Auth**: `e2e/auth.spec.ts` - Authentication flows
- **Security**: `e2e/security.spec.ts` - Authorization & protection
- **Admin**: `e2e/admin-dashboard.spec.ts` - Admin panel access control

## Expected Results

### ✅ Passing Tests
- Authentication rejection without credentials (401)
- Admin secret rejection without proper authorization
- Frontend component rendering
- XSS prevention with DOMPurify

### ⚠️ Currently Blocked
- Admin endpoints requiring admin secret (need database setup)
- User management operations (need database setup)
- Session management (need database setup)
- E2E flows (need running dev servers)

## Fixing the Tests (Step by Step)

### 1. Setup Test Database
```bash
# Using PostgreSQL
psql -U postgres -c "CREATE DATABASE pr_manager_test;"

# Or using Docker
docker exec pr-manager-test psql -U postgres -c "CREATE DATABASE pr_manager_test;"
```

### 2. Run Migrations
```bash
cd packages/backend
npx prisma migrate deploy
```

### 3. Verify Test Database Connection
```bash
npm run test -w @pr-manager/backend -- tests/routes/admin/users.test.ts
```

## Troubleshooting

### Error: `relation "user" does not exist`
- **Cause**: Migrations not applied to test database
- **Fix**: Run `npx prisma migrate deploy`

### Error: `Foreign key constraint violated`
- **Cause**: Database not cleaned between tests
- **Fix**: Ensure `beforeEach()` in setup.ts runs properly

### Error: `Invalid admin secret`
- **Cause**: Secret not found in database
- **Fix**: Verify admin user created in `beforeAll()`

### Error: `adminSecretValid is undefined`
- **Cause**: Middleware not setting user context
- **Fix**: Check admin secret middleware in `src/routes/admin.ts`

## CI/CD Integration

Tests are configured to run in GitHub Actions:

```yaml
# .github/workflows/ci.yml
- test-app: Runs frontend tests
- test-backend: Runs backend tests with PostgreSQL service
- test-e2e: Runs Playwright tests
```

See `.github/workflows/ci.yml` for full configuration.

## Test Coverage Goals

| Module | Target | Current |
|--------|--------|---------|
| Backend Core | 85% | ~40% (blocked on DB) |
| Auth Middleware | 95% | ~50% (blocked on DB) |
| Admin Routes | 90% | ~30% (blocked on DB) |
| Frontend Services | 85% | ~80% |
| Frontend Utils | 95% | ~90% |
| E2E Flows | 80% | Ready (needs servers) |

## Next Steps

1. **Set up local test database** (PostgreSQL or Docker)
2. **Run migrations**: `npx prisma migrate deploy`
3. **Execute tests**: `npm run test -w @pr-manager/backend`
4. **Fix any remaining issues** in admin middleware
5. **Run E2E tests** with dev servers: `npm run e2e`
6. **Merge and deploy** with confidence!

## References

- [Vitest Documentation](https://vitest.dev)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Playwright Documentation](https://playwright.dev)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
