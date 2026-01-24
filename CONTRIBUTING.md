# Contributing Guide

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to automate versioning and changelog generation.

### Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | Minor (1.x.0) |
| `fix` | Bug fix | Patch (1.0.x) |
| `docs` | Documentation only | None |
| `style` | Code style (formatting, semicolons, etc.) | None |
| `refactor` | Code change that neither fixes a bug nor adds a feature | None |
| `perf` | Performance improvement | Patch (1.0.x) |
| `test` | Adding or correcting tests | None |
| `chore` | Maintenance tasks | None |
| `ci` | CI/CD changes | None |
| `build` | Build system or dependencies | None |

### Breaking Changes

For breaking changes, add `!` after the type or include `BREAKING CHANGE:` in the footer:

```bash
feat!: redesign settings API

# or

feat: redesign settings API

BREAKING CHANGE: Settings now use a different storage format.
```

Breaking changes trigger a **major** version bump (x.0.0).

### Examples

```bash
# Feature
feat: add dark mode toggle

# Bug fix
fix: correct token refresh on expiration

# Feature with scope
feat(notifications): add sound options

# Breaking change
feat!: change authentication flow

# Commit with body
fix: resolve memory leak in PR polling

The polling interval was not being cleared when the window closed,
causing memory to accumulate over time.
```

### Validation

Commits are validated locally using [commitlint](https://commitlint.js.org/) and [husky](https://typicode.github.io/husky/). Invalid commits will be rejected.

To test your commit message:
```bash
echo "feat: my message" | npx commitlint
```

---

## Release Process

This project uses [Release Please](https://github.com/googleapis/release-please) for automated releases.

### How It Works

1. **Make commits** to `main` using conventional commit format
2. **Release Please** automatically creates/updates a Release PR with:
   - Version bump based on commit types
   - Auto-generated CHANGELOG
3. **Merge the PR** when ready to release
4. **GitHub Actions** automatically:
   - Creates a git tag (e.g., `v1.2.0`)
   - Creates a GitHub Release
   - Builds and uploads binaries for macOS, Windows, and Linux

### Automatic Version Bumps

| Commits Since Last Release | Next Version |
|---------------------------|--------------|
| Only `fix:` commits | Patch (1.0.1 -> 1.0.2) |
| At least one `feat:` | Minor (1.0.1 -> 1.1.0) |
| Any breaking change | Major (1.0.1 -> 2.0.0) |

### Manual Release (If Needed)

To force a release manually:
1. Go to **Actions** > **Release Please**
2. Click **Run workflow**
3. Select release type (patch/minor/major)
4. The Release PR will be created/updated
5. Merge it to trigger the release

---

## Development

### Prerequisites

- **Node.js 20+** - [Download](https://nodejs.org/)
- **npm** - Comes with Node.js
- **Docker Desktop** - Required for local database
  - [macOS / Windows](https://www.docker.com/products/docker-desktop/)
  - Linux: `sudo apt install docker.io docker-compose`

### Initial Setup

```bash
# 1. Clone the repository
git clone https://github.com/dlopezmartinez/PR-Manager.git
cd PR-Manager

# 2. Install dependencies
npm install

# 3. Start the database (Docker must be running)
npm run db:up

# 4. Setup backend database
cd packages/backend
cp .env.example .env        # Configure your environment
npx prisma migrate deploy   # Apply migrations
cd ../..

# 5. Start development
npm run app:dev       # Electron app
npm run backend:dev   # Backend server
npm run landing:dev   # Landing page
```

### Database Commands

```bash
npm run db:up       # Start PostgreSQL in Docker
npm run db:down     # Stop PostgreSQL
npm run db:reset    # Reset database (deletes all data)
```

### Running Tests

```bash
# Backend tests (auto-starts Docker if needed)
npm run backend:test    # Starts DB, runs migrations, executes tests

# If you prefer manual control:
npm run db:up           # Start PostgreSQL manually
npm run backend:test:only  # Run tests without DB setup

# Run all tests
npm run test

# Electron app tests (no database needed)
npm run app:test
```

> **Note:** `backend:test` automatically checks if Docker is running, starts the PostgreSQL container, applies migrations, and then runs tests. You just need Docker Desktop installed and running.

### Development Commands

```bash
# Start development servers
npm run app:dev         # Electron app with hot-reload
npm run backend:dev     # Backend API server
npm run landing:dev     # Landing page

# Linting
npm run lint            # Run ESLint on all packages
npm run app:lint        # Lint only app
```

### Building

```bash
# Build all packages
npm run build

# Build specific packages
npm run app:build       # Build Electron app
npm run backend:build   # Build backend
npm run landing:build   # Build landing page

# Create distributables (DMG, EXE, etc.)
npm run app:make        # Current platform
npm run app:make:mac    # macOS DMG
npm run app:make:win    # Windows installer
npm run app:make:linux  # Linux packages
```

### Environment Variables

Each package has its own `.env.example` file:

```bash
packages/app/.env.example       # Electron app config
packages/backend/.env.example   # Backend API config
packages/landing/.env.example   # Landing page config (if any)
```

Copy and configure as needed:
```bash
cp packages/backend/.env.example packages/backend/.env
# Edit .env with your values
```

---

## Branch Strategy (GitFlow)

This project follows a GitFlow-inspired branching strategy with automated releases.

### Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code. Minor/Major releases are made from here. |
| `develop` | Integration branch for features. Patch releases are made from here. |
| `feature/*` | Feature development. Created from and merged into `develop`. |

### Workflow Diagram

```
feature/xxx ──PR──> develop ──PR──> main
                        │              │
                   Patch Release   Minor Release
                   (automatic)     (on merge)
                                       │
                                   Major Release
                                   (manual workflow)
```

### Feature Development (Patch Release Flow)

1. Create a feature branch from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/my-feature
   ```

2. Make your changes and commit using [Conventional Commits](#commit-convention)

3. Push and create a PR to `develop`:
   ```bash
   git push origin feature/my-feature
   # Create PR: feature/my-feature → develop
   ```

4. After PR is merged to `develop`:
   - Release Please automatically creates a Release PR
   - Merging the Release PR creates a **patch version** (e.g., 1.1.0 → 1.1.1)
   - Binaries are automatically built and published

### Minor Release (develop → main)

When `develop` has accumulated features ready for a stable release:

1. Create a PR from `develop` to `main`
2. Review and merge the PR
3. The Minor Release workflow automatically:
   - Bumps the minor version (e.g., 1.1.1 → 1.2.0)
   - Creates a git tag and GitHub Release
   - Triggers binary builds for all platforms

### Major Release (Breaking Changes)

For major version bumps with breaking changes:

1. Go to **Actions** → **Major Release** → **Run workflow**
2. Type `MAJOR` to confirm
3. Optionally include pending develop changes
4. The workflow:
   - Bumps the major version (e.g., 1.2.0 → 2.0.0)
   - Creates a git tag and GitHub Release
   - Syncs `develop` with the new version

### Release Types Summary

| Release Type | Trigger | Version Bump | Example |
|--------------|---------|--------------|---------|
| Patch | Merge to `develop` | x.x.+1 | 1.1.0 → 1.1.1 |
| Minor | Merge `develop` → `main` | x.+1.0 | 1.1.1 → 1.2.0 |
| Major | Manual workflow | +1.0.0 | 1.2.0 → 2.0.0 |
