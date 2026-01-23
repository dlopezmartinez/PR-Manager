# E2E Tests with Playwright

End-to-end tests for PR Manager using Playwright.

## 📋 Test Suites

### 1. **Landing Page** (`landing.spec.ts`)
Tests that validate the landing page functionality:
- ✅ Page loads correctly
- ✅ Navigation elements exist
- ✅ CTA buttons are present
- ✅ Images load without errors
- ✅ Mobile responsiveness
- ✅ No console errors

### 2. **Authentication** (`auth.spec.ts`)
Tests for signup, login, and logout flows:
- ✅ Signup with valid credentials
- ✅ Email validation
- ✅ Password strength validation
- ✅ Duplicate email prevention
- ✅ Login with correct credentials
- ✅ Login rejection with wrong password
- ✅ Helpful error messages
- ✅ Logout functionality
- ✅ Session persistence

### 3. **Security** (`security.spec.ts`)
Tests for authentication, authorization, and security best practices:
- ✅ Unauthenticated access denied
- ✅ Invalid tokens rejected
- ✅ Role-based access control
- ✅ Token validation (format, expiry)
- ✅ CORS policies
- ✅ Input validation
- ✅ SQL injection prevention
- ✅ XSS prevention
- ✅ Rate limiting
- ✅ Session security

### 4. **Admin Dashboard** (`admin-dashboard.spec.ts`)
Tests for admin-specific functionality:
- ✅ Regular users denied access
- ✅ Admin users allowed access
- ✅ User management operations
- ✅ Session revocation
- ✅ Audit log access
- ✅ Form validation
- ✅ Prevent self-modification

## 🚀 Running Tests

### Run all tests
```bash
npm run e2e
```

### Run tests in UI mode (interactive)
```bash
npm run e2e:ui
```

### Debug tests
```bash
npm run e2e:debug
```

### Run tests in headed mode (see browser)
```bash
npm run e2e:headed
```

### Run specific test file
```bash
npx playwright test e2e/landing.spec.ts
```

### Run specific test
```bash
npx playwright test e2e/auth.spec.ts -g "should successfully login"
```

## 📊 Test Structure

Each test file follows this pattern:

```typescript
test.describe('Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
  });

  test('should do something', async ({ page }) => {
    // Arrange
    // Act
    // Assert
  });
});
```

## 🔧 Configuration

Playwright configuration is in `playwright.config.ts`:

- **Base URL**: `http://localhost:5173`
- **Web servers**: Landing (port 3000) and Backend (port 3001)
- **Browsers**: Chromium, Firefox, WebKit
- **Artifacts**: Screenshots and videos on failure
- **Retries**: 2 in CI, 0 locally

## 🔐 Test Users

Available test users in `fixtures.ts`:

```typescript
{
  superuser: {
    email: 'superuser@prmanager.test',
    password: 'SuperSecure123!@#',
    role: 'SUPERUSER',
  },
  admin: {
    email: 'admin@prmanager.test',
    password: 'AdminSecure123!@#',
    role: 'ADMIN',
  },
  user: {
    email: 'user@prmanager.test',
    password: 'UserSecure123!@#',
    role: 'USER',
  },
}
```

## 🛠️ Helper Functions

### `apiRequest(method, endpoint, body, token)`
Make direct API calls to the backend:

```typescript
const response = await apiRequest('GET', '/admin/health', undefined, token);
```

### `signupUser(email, password, name)`
Create a new user:

```typescript
const result = await signupUser('user@test.com', 'Password123!', 'John Doe');
```

### `loginUser(email, password)`
Authenticate a user and get tokens:

```typescript
const { accessToken, refreshToken, user } = await loginUser('user@test.com', 'Password123!');
```

## 📈 Best Practices

1. **Isolation**: Each test is independent
2. **Cleanup**: Tests clean up after themselves
3. **Realistic Flows**: Tests follow actual user workflows
4. **Error Handling**: Tests validate error scenarios
5. **Performance**: Tests run in parallel where possible

## 🐛 Debugging

### View test report
After running tests, open the HTML report:
```bash
npx playwright show-report
```

### Step through tests
Use `test.only()` to run a single test:
```typescript
test.only('should debug this', async ({ page }) => {
  // ...
});
```

### Use Playwright Inspector
```bash
npm run e2e:debug
```

## 📝 CI/CD Integration

Tests run automatically on:
- Pull requests to `develop` or `main`
- Pushes to `develop`

Configuration in `.github/workflows/ci.yml`

## 🚦 Expected Outcomes

### ✅ Passing Tests
- Landing page loads correctly
- Users can signup and login
- Session management works
- Admin access is protected
- Rate limiting is enforced
- Security headers are present

### ❌ Failing Tests
Should indicate:
- Broken authentication flow
- Missing security controls
- Regression in access control
- Performance issues
- UI layout problems

## 📚 Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Test Examples](https://github.com/microsoft/playwright/tree/main/examples)

## 🔗 Related

- [Unit Tests](../packages/backend/tests)
- [Integration Tests](../packages/backend/tests/routes)
- [Frontend Tests](../packages/app/tests)
