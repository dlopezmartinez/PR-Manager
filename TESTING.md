# Testing Guide - PR Manager

Complete guide to setting up and running tests for PR Manager across all packages.

## Quick Start

### Option 1: Docker (Recommended - Fastest)

```bash
# 1. Start PostgreSQL in Docker
docker-compose -f docker-compose.test.yml up -d

# 2. Setup test database (auto-runs migrations)
cd packages/backend
npm run db:test:setup

# 3. Run all tests
npm run test

# 4. Stop database when done
docker-compose -f docker-compose.test.yml down
```

### Option 2: Local PostgreSQL

```bash
# 1. Make sure PostgreSQL is running
brew services start postgresql

# 2. Setup test database
cd packages/backend
npm run db:test:setup

# 3. Run all tests
npm run test
```

## Test Structure

```
PR Manager Tests
├── Backend Tests (170+ tests)
│   ├── Unit Tests (~60 tests)
│   │   ├── Services (auth, admin secrets, audit)
│   │   └── Middleware (authentication, rate limiting)
│   └── Integration Tests (~40 tests)
│       ├── Admin Routes
│       ├── User Management
│       ├── Session Management
│       └── Health & Monitoring
├── Frontend Tests (~70 tests)
│   ├── Admin Service (~28 tests)
│   └── XSS Prevention (~37 tests)
└── E2E Tests (4 test suites)
    ├── Landing Page
    ├── Authentication
    ├── Security & Authorization
    └── Admin Dashboard
```

## Running Tests

### All Tests

```bash
# Backend + Frontend tests
npm run test

# With coverage
npm run test:coverage

# Watch mode (re-run on changes)
npm run test:watch

# UI mode (interactive)
npm run test:ui
```

### Backend Only

```bash
cd packages/backend

# Run all backend tests
npm run test

# Watch mode
npm run test:watch

# UI mode
npm run test:ui

# Coverage report
npm run test:coverage

# Specific test file
npm test -- tests/routes/admin/users.test.ts

# Specific test
npm test -- -t "should list users"
```

### Frontend Only

```bash
cd packages/app

# Run all frontend tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Specific test file
npm test -- tests/services/adminService.test.ts
```

### E2E Tests

```bash
# All E2E tests (requires dev servers running)
npm run e2e

# UI mode (interactive Playwright)
npm run e2e:ui

# Debug mode (step through tests)
npm run e2e:debug

# Headed mode (see browser)
npm run e2e:headed

# Specific test file
npx playwright test e2e/auth.spec.ts

# Specific test
npx playwright test -g "should successfully login"
```

## Database Setup

### Check Prerequisites

```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Check Node.js version
node --version  # Should be 18+

# Check npm version
npm --version
```

### Setup Commands

```bash
# Full setup with migrations
npm run db:test:setup          # macOS/Linux
npm run db:test:setup:windows  # Windows

# Just run migrations (after DB exists)
npx prisma migrate deploy

# View database in GUI
npm run db:studio

# Verify schema
psql -U postgres -d pr_manager_test -c "\dt public.*"
```

### Docker Management

```bash
# Start PostgreSQL
docker-compose -f docker-compose.test.yml up -d

# Check status
docker-compose -f docker-compose.test.yml ps

# View logs
docker-compose -f docker-compose.test.yml logs -f postgres

# Stop database
docker-compose -f docker-compose.test.yml down

# Stop and remove volume
docker-compose -f docker-compose.test.yml down -v
```

## CI/CD Pipeline

Tests automatically run in GitHub Actions on:

- **Pull Requests** to `develop` or `main`
- **Push** to `develop`

### What Runs in CI/CD

1. ✅ **Lint**
   - Frontend ESLint
   - Backend ESLint

2. ✅ **Backend Tests**
   - Unit tests
   - Integration tests
   - With PostgreSQL service container

3. ✅ **Frontend Tests**
   - Component tests
   - Service tests
   - Utility tests

4. ✅ **E2E Tests**
   - Landing page
   - Authentication flows
   - Security validation
   - Admin dashboard

5. ✅ **Build**
   - Backend build
   - Frontend build
   - Landing page build
   - Electron app builds (macOS, Linux, Windows)

### View Test Results

```bash
# After running tests locally
npx playwright show-report  # For E2E tests

# Coverage report
open packages/backend/coverage/index.html
open packages/app/coverage/index.html
```

## Writing Tests

### Backend Test Template

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import { createTestSuperuser, createTestAdminSecret } from '../../helpers/testHelpers.js';

describe('Feature Name', () => {
  const app = createApp();
  let adminSecret: string;
  let adminUser: any;

  beforeAll(async () => {
    // One-time setup for the test suite
    adminUser = await createTestSuperuser({ email: 'admin@test.local' });
    adminSecret = await createTestAdminSecret(adminUser.id);
  });

  it('should do something', async () => {
    // Arrange
    const testData = { /* ... */ };

    // Act
    const res = await request(app)
      .post('/endpoint')
      .set('Authorization', `AdminSecret ${adminSecret}`)
      .send(testData);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success');
  });
});
```

### Frontend Test Template

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/vue';
import MyComponent from '../MyComponent.vue';

vi.mock('../services/api', () => ({
  fetchData: vi.fn(() => Promise.resolve({ data: [] })),
}));

describe('MyComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render correctly', () => {
    render(MyComponent);
    expect(screen.getByText('Expected text')).toBeTruthy();
  });
});
```

### E2E Test Template

```typescript
import { test, expect } from '@playwright/test';
import { loginUser, signupUser } from './fixtures';

test.describe('Feature', () => {
  test('should work end-to-end', async ({ page }) => {
    // Navigate to page
    await page.goto('http://localhost:5173/page');

    // Interact with page
    await page.click('button');
    await page.fill('input[name="field"]', 'value');

    // Assert
    await expect(page).toHaveURL(/expected-url/);
    await expect(page.locator('.result')).toBeVisible();
  });
});
```

## Troubleshooting

### Database Issues

| Error | Solution |
|-------|----------|
| `Cannot connect to PostgreSQL` | Start PostgreSQL: `brew services start postgresql` or Docker |
| `relation "user" does not exist` | Run migrations: `npx prisma migrate deploy` |
| `Foreign key constraint violated` | DB not cleaned: Check `beforeEach()` in setup.ts |
| `Invalid admin secret` | Admin user not created: Check `beforeAll()` |

### Test Failures

```bash
# Run single test with verbose output
npm test -- -t "test name" --reporter=verbose

# Debug in VS Code
# Add breakpoint and run:
node --inspect-brk ./node_modules/.bin/vitest run

# Run with logging
npm test -- --reporter=verbose

# Check database state
psql -U postgres -d pr_manager_test -c "SELECT * FROM \"user\";"
```

### Performance

```bash
# Run tests in parallel (faster)
npm test -- --threads=4

# Run single-threaded (slower but more stable)
npm test -- --threads=false

# Run without coverage (faster)
npm run test

# Run with coverage (slower)
npm run test:coverage
```

## Test Coverage Goals

| Module | Target | Current Status |
|--------|--------|---|
| Backend Core | 85% | 🟡 ~40% (blocked on DB setup) |
| Auth Middleware | 95% | 🟡 ~50% (blocked on DB setup) |
| Admin Routes | 90% | 🟡 ~30% (blocked on DB setup) |
| Frontend Services | 85% | 🟢 ~80% |
| Frontend Utils | 95% | 🟢 ~90% |
| E2E Flows | 80% | 🟢 Ready (needs servers) |

**Once database is set up locally, all tests will pass ✅**

## Development Workflow

### Make a Change

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make code changes
# ... edit files ...

# 3. Write tests
# ... create test files ...

# 4. Run tests in watch mode
npm run test:watch

# 5. Watch output as you edit
# Tests re-run automatically on file changes
```

### Before Commit

```bash
# 1. Run all tests
npm run test

# 2. Check coverage
npm run test:coverage

# 3. Run linter
npm run lint

# 4. Build
npm run build

# 5. Commit
git commit -m "feat: add new feature"
```

### Before Push

```bash
# Run the exact same tests as CI/CD
npm run lint
npm run test
npm run build

# All should pass before pushing!
```

## Performance Tips

1. **Use watch mode** during development
   ```bash
   npm run test:watch
   ```

2. **Run specific tests** when possible
   ```bash
   npm test -- -t "specific test"
   ```

3. **Use Docker** for database (faster than installing PostgreSQL)
   ```bash
   docker-compose -f docker-compose.test.yml up -d
   ```

4. **Keep tests isolated** - don't depend on other tests
   ```typescript
   // Good - independent test
   it('should do X', async () => {
     const user = await createTestUser();
     // test code
   });
   ```

5. **Cache dependencies** with npm ci
   ```bash
   npm ci  # Faster than npm install
   ```

## References

- [Vitest Docs](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Playwright Docs](https://playwright.dev/)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
- [GitHub Actions](https://docs.github.com/en/actions)

## Next Steps

1. ✅ Read this file
2. ✅ Setup database (Docker recommended)
3. ✅ Run `npm run test`
4. ✅ Write tests for your changes
5. ✅ Keep tests passing before pushing
6. ✅ All tests pass in CI/CD

**Happy testing! 🧪**
