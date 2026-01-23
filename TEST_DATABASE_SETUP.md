# Test Database Setup Guide

## Overview

The PR Manager project now has a **complete test database infrastructure** that:

✅ Creates a fresh PostgreSQL database for each test run
✅ Automatically applies all Prisma migrations
✅ Isolates test data completely (separate from production)
✅ Works locally and in CI/CD environments
✅ Replicates the exact schema as production

## Architecture

### Database Strategy

```
Production Database (production)
├── Main application data
├── Real users, subscriptions, webhooks
└── Long-term persistence

Test Database (pr_manager_test)
├── Created fresh for each test run
├── Same schema as production
├── Isolated test data only
├── Destroyed after tests complete (CI/CD)
└── Persists for local development
```

## Local Setup (Development)

### Option 1: PostgreSQL installed locally

```bash
# 1. Start PostgreSQL service
brew services start postgresql

# 2. Create test database
createdb pr_manager_test

# 3. Run setup script (macOS/Linux)
cd packages/backend
bash scripts/setup-test-db.sh

# Or on Windows
cmd /c scripts/setup-test-db.cmd

# 4. Run tests
npm run test
```

### Option 2: Docker (Recommended)

```bash
# 1. Start PostgreSQL in Docker
docker run --name pr-manager-test \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=pr_manager_test \
  -p 5432:5432 \
  -d postgres:15

# 2. Wait for container to be ready
sleep 5

# 3. Run setup script
cd packages/backend
bash scripts/setup-test-db.sh

# 4. Run tests
npm run test

# 5. Stop container when done
docker stop pr-manager-test
docker rm pr-manager-test
```

### Manual Setup (if scripts don't work)

```bash
# 1. Connect to PostgreSQL
psql -U postgres

# 2. Create test database
CREATE DATABASE pr_manager_test WITH ENCODING 'UTF8';
\q

# 3. Run migrations
export DATABASE_URL="postgresql://postgres@localhost:5432/pr_manager_test"
npx prisma migrate deploy

# 4. Verify setup
psql -U postgres -d pr_manager_test -c "\dt public.*"
```

## CI/CD Integration

### GitHub Actions Workflow

The `.github/workflows/ci.yml` file has been updated to:

1. **Spin up PostgreSQL service container**
   ```yaml
   services:
     postgres:
       image: postgres:15
       env:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: postgres
         POSTGRES_DB: pr_manager_test
   ```

2. **Wait for database to be ready**
   ```yaml
   - name: "⏳ Wait for PostgreSQL to be ready"
     run: |
       until pg_isready -h localhost -p 5432 -U postgres; do
         echo 'PostgreSQL is unavailable - sleeping'
         sleep 1
       done
   ```

3. **Generate Prisma Client**
   ```yaml
   - name: "🔧 Generate Prisma Client"
     run: npx prisma generate
   ```

4. **Run migrations**
   ```yaml
   - name: "🗄️ Setup test database - Run migrations"
     run: npx prisma migrate deploy
   ```

5. **Run tests**
   ```yaml
   - name: "🧪 Run backend tests"
     run: npm run test
   ```

### Environment Variables in CI/CD

```
DATABASE_URL: postgresql://postgres:postgres@localhost:5432/pr_manager_test?schema=public
JWT_SECRET: test-jwt-secret-key-for-testing-12345
DOWNLOAD_SECRET: test-download-secret-for-testing-12345
NODE_ENV: test
```

## Commands

### Backend Testing

```bash
# Setup test database
npm run db:test:setup          # macOS/Linux
npm run db:test:setup:windows  # Windows

# Run all tests
npm run test

# Watch mode (re-run on file changes)
npm run test:watch

# UI mode (interactive)
npm run test:ui

# With coverage
npm run test:coverage

# Specific test file
npm test -- tests/routes/admin/users.test.ts
```

### Database Management

```bash
# Generate Prisma Client
npm run db:generate

# Run migrations (for production)
npm run db:migrate:deploy

# Open Prisma Studio (GUI)
npm run db:studio

# Create seed data
npm run seed:user
```

## Database Migrations

### How Migrations Work

1. **Prisma schema** (`prisma/schema.prisma`) defines the database structure
2. **Migrations** are stored in `prisma/migrations/` directory
3. Each migration has:
   - A timestamp-based folder name
   - A `migration.sql` file with SQL changes
4. When running tests, `prisma migrate deploy` applies all pending migrations

### Creating a New Migration

```bash
cd packages/backend

# Create a new migration
npx prisma migrate dev --name descriptive_name

# This:
# 1. Analyzes changes to prisma/schema.prisma
# 2. Generates SQL migration
# 3. Applies it to your development database
# 4. Generates updated Prisma Client
```

## Test Isolation

### How Tests Stay Isolated

**Setup Phase** (`beforeEach` in `tests/setup.ts`):
```typescript
beforeEach(async () => {
  // Use TRUNCATE CASCADE for clean database
  await prisma.$executeRawUnsafe('TRUNCATE TABLE webhook_queue CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE webhook_events CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "user" CASCADE');
});
```

This ensures:
- ✅ Each test starts with a clean database
- ✅ No test data leaks between tests
- ✅ TRUNCATE CASCADE respects foreign keys
- ✅ Auto-increment IDs are reset

### Test Database Cleanup Strategy

```
Test Suite Starts
│
├─ beforeAll (one-time setup)
│   └─ Create admin user and admin secret
│
├─ Test 1: GET /admin/users
│   ├─ beforeEach: Clean database
│   ├─ Test code: Create users, make request, assert
│   └─ afterEach: Verify no side effects
│
├─ Test 2: POST /admin/users/:id/suspend
│   ├─ beforeEach: Clean database (fresh start)
│   ├─ Test code: Create user, suspend, verify
│   └─ afterEach: Verify no side effects
│
└─ afterAll (cleanup)
    └─ Disconnect from database
```

## Troubleshooting

### Error: `relation "user" does not exist`

**Cause**: Migrations haven't been applied to test database

**Solution**:
```bash
# Run migrations manually
npx prisma migrate deploy

# Or use setup script
npm run db:test:setup  # macOS/Linux
npm run db:test:setup:windows  # Windows
```

### Error: `Cannot connect to PostgreSQL`

**Cause**: PostgreSQL service not running

**Solution**:
```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Start PostgreSQL
brew services start postgresql  # macOS

# Or start Docker container
docker run --name pr-manager-test \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d postgres:15
```

### Error: `Foreign key constraint violated`

**Cause**: Database not cleaned properly between tests

**Solution**: Check that `tests/setup.ts` is being loaded and `beforeEach()` is running

```bash
# Debug database state
psql -U postgres -d pr_manager_test -c "SELECT COUNT(*) FROM \"user\";"
```

### Error: `Invalid admin secret`

**Cause**: Secret not found in database or key doesn't match

**Solution**: Verify admin user was created in `beforeAll()`

```typescript
// Check testHelpers.ts
export async function createTestAdminSecret(userId: string, name = 'Test Secret') {
  return createAdminSecret(userId, name);  // Returns plain secret
}
```

## Local Development Workflow

### 1. First Time Setup

```bash
# Clone repo
git clone <repo>
cd electron-app

# Install dependencies
npm ci

# Start PostgreSQL
docker run --name pr-manager-test \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d postgres:15

# Setup test database
cd packages/backend
npm run db:test:setup
```

### 2. Running Tests

```bash
# Watch mode - tests re-run on file changes
npm run test:watch

# Or run once
npm run test

# Or with UI
npm run test:ui
```

### 3. Adding New Tests

```bash
# Create test file
# packages/backend/tests/routes/admin/myfeature.test.ts

# Write tests using fixtures and helpers
# Run: npm run test:watch
# Tests automatically reload
```

### 4. Database Inspection

```bash
# View database in GUI
npm run db:studio

# Or query directly
psql -U postgres -d pr_manager_test -c "\dt public.*"
```

## CI/CD Pipeline

### Test Execution Flow

```
1. Checkout code
2. Setup Node.js
3. Install dependencies
4. Lint code
5. Wait for PostgreSQL service
6. Generate Prisma Client
7. Run migrations
8. Verify schema
9. Run tests ← Tests execute here
10. Upload coverage
11. Build backend
12. Run E2E tests
```

### Parallel Jobs

```
lint-app ────────────────┐
                         ├─→ test-app ────┐
                                          ├─→ test-e2e ──→ Done
lint-backend ────────────┐                │
                         ├─→ test-backend ┤
                                          ├─→ build-backend
                                          │
                                          └─→ build-landing
                                          │
                                          └─→ build-app
```

## Verification

### Check that everything works:

```bash
# 1. Setup database
npm run db:test:setup

# 2. Run tests
npm run test

# 3. Check coverage
npm run test:coverage

# 4. Open report
open coverage/index.html
```

Expected output:
```
✓ Test database connected
✓ Migrations applied
✓ Tests running...

Test Files  1 passed (1)
Tests      15 passed (15)
```

## References

- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
- [PostgreSQL Docker](https://hub.docker.com/_/postgres)
- [GitHub Actions Services](https://docs.github.com/en/actions/using-containerized-services)
- [Vitest Documentation](https://vitest.dev/)
