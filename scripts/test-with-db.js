#!/usr/bin/env node

/**
 * Cross-platform script to start Docker PostgreSQL and run tests
 * Works on macOS, Linux, and Windows
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
};

function log(color, emoji, message) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

function exec(command, options = {}) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...options });
  } catch (error) {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  process.chdir(rootDir);

  log(colors.yellow, '🔍', 'Checking Docker status...');

  // Check if Docker is running
  const dockerInfo = exec('docker info');
  if (!dockerInfo) {
    log(colors.red, '❌', 'Docker is not running.');
    log(colors.yellow, '  ', 'Please start Docker Desktop and try again.');
    process.exit(1);
  }

  log(colors.green, '✓', 'Docker is running');

  // Check container status
  const containerName = 'pr-manager-db';
  const containerStatus = exec(`docker ps -a --filter "name=${containerName}" --format "{{.Status}}"`);

  if (!containerStatus || !containerStatus.trim()) {
    log(colors.yellow, '📦', 'Starting PostgreSQL container...');
    exec('docker compose up -d', { stdio: 'inherit' });
  } else if (!containerStatus.trim().startsWith('Up')) {
    log(colors.yellow, '📦', 'Container exists but not running. Starting...');
    exec('docker compose up -d', { stdio: 'inherit' });
  } else {
    log(colors.green, '✓', 'PostgreSQL container is already running');
  }

  // Wait for PostgreSQL to be ready
  log(colors.yellow, '⏳', 'Waiting for PostgreSQL to be ready...');
  const maxAttempts = 30;
  let attempt = 0;

  while (attempt < maxAttempts) {
    const ready = exec(`docker exec ${containerName} pg_isready -U postgres`);
    if (ready !== null) {
      log(colors.green, '✓', 'PostgreSQL is ready');
      break;
    }
    attempt++;
    if (attempt === maxAttempts) {
      log(colors.red, '❌', `PostgreSQL failed to start after ${maxAttempts} attempts`);
      process.exit(1);
    }
    await sleep(1000);
  }

  // Set test database URL for all subsequent operations
  const testDbUrl = 'postgresql://postgres:postgres@localhost:5432/pr_manager_test';
  process.env.DATABASE_URL = testDbUrl;

  // Run Prisma migrations
  log(colors.yellow, '🔄', 'Applying database migrations...');
  process.chdir(path.join(rootDir, 'packages', 'backend'));

  // Generate Prisma client and apply migrations with test DB URL
  const envWithTestDb = { ...process.env, DATABASE_URL: testDbUrl };

  exec('npx prisma generate --schema=./prisma/schema.prisma', { env: envWithTestDb });

  const migrateResult = exec('npx prisma migrate deploy --schema=./prisma/schema.prisma', { env: envWithTestDb });
  if (!migrateResult) {
    log(colors.yellow, '  ', 'Running prisma db push instead...');
    exec('npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss', { env: envWithTestDb });
  }

  process.chdir(rootDir);
  log(colors.green, '✓', 'Database ready');
  console.log('');

  // Run tests with local test database URL
  log(colors.yellow, '🧪', 'Running backend tests...');

  const testProcess = spawn('npm', ['run', 'test', '-w', '@pr-manager/backend'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/pr_manager_test',
    },
  });

  testProcess.on('close', (code) => {
    process.exit(code);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
