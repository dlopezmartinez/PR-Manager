import { beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';

// Mock environment variables for tests - MUST be set before any imports
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-12345';
process.env.DOWNLOAD_SECRET = 'test-download-secret';
process.env.LEMONSQUEEZY_WEBHOOK_SECRET = 'test-webhook-secret-for-testing';
process.env.LEMONSQUEEZY_API_KEY = 'test_api_key';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/pr_manager_test';

beforeAll(async () => {
  // Ensure database connection
  try {
    await prisma.$connect();
    console.log('✓ Test database connected');
  } catch (error) {
    console.error('✗ Failed to connect to test database:', error);
    process.exit(1);
  }
});

beforeEach(async () => {
  // Clean database before each test
  // Order matters due to foreign key constraints
  try {
    // Delete tables with FKs to users first (before cascades)
    await prisma.$executeRawUnsafe('TRUNCATE TABLE webhook_queue CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE webhook_events CASCADE');
    // Use TRUNCATE CASCADE to properly reset sequences and clean all related records
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
  } catch (error) {
    // If TRUNCATE fails, fall back to deleteMany
    try {
      await prisma.webhookQueue.deleteMany();
      await prisma.webhookEvent.deleteMany();
      await prisma.user.deleteMany();
    } catch (deleteError) {
      console.error('Failed to clean database:', deleteError);
      throw deleteError;
    }
  }
});

afterEach(async () => {
  // Additional cleanup if needed
  vi.clearAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});
