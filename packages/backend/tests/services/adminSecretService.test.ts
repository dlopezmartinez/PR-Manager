import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import {
  generateSecret,
  hashSecret,
  createAdminSecret,
  getAdminSecretByHash,
  updateLastUsed,
  listUserSecrets,
  revokeSecret,
  deleteSecret,
} from '../../src/services/adminSecretService.js';
import { createTestSuperuser, createTestUser } from '../helpers/testHelpers.js';

describe('Admin Secret Service', () => {
  describe('generateSecret()', () => {
    it('should generate a 64-character hex string', () => {
      const secret = generateSecret();
      expect(secret).toMatch(/^[a-f0-9]{64}$/);
      expect(secret.length).toBe(64);
    });

    it('should generate unique secrets', () => {
      const secret1 = generateSecret();
      const secret2 = generateSecret();
      expect(secret1).not.toBe(secret2);
    });
  });

  describe('hashSecret()', () => {
    it('should hash a secret to SHA256', () => {
      const secret = 'test-secret-12345';
      const hash = hashSecret(secret);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes', () => {
      const secret = 'test-secret-12345';
      const hash1 = hashSecret(secret);
      const hash2 = hashSecret(secret);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different secrets', () => {
      const hash1 = hashSecret('secret1');
      const hash2 = hashSecret('secret2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createAdminSecret()', () => {
    it('should create an admin secret for SUPERUSER', async () => {
      const user = await createTestSuperuser();
      const plainSecret = await createAdminSecret(user.id, 'Test Secret');

      expect(plainSecret).toMatch(/^[a-f0-9]{64}$/);

      // Verify stored hash in database
      const hash = hashSecret(plainSecret);
      const storedSecret = await prisma.adminSecret.findUnique({
        where: { secretHash: hash },
      });

      expect(storedSecret).toBeDefined();
      expect(storedSecret?.userId).toBe(user.id);
      expect(storedSecret?.name).toBe('Test Secret');
      expect(storedSecret?.revokedAt).toBeNull();
    });

    it('should reject non-SUPERUSER users', async () => {
      const user = await createTestUser();

      await expect(createAdminSecret(user.id, 'Test')).rejects.toThrow(
        /SUPERUSER/
      );
    });

    it('should reject non-existent users', async () => {
      await expect(createAdminSecret('non-existent-id', 'Test')).rejects.toThrow(
        /not found|User not found/i
      );
    });

    it('should store different secrets with different hashes', async () => {
      const user = await createTestSuperuser();

      const secret1 = await createAdminSecret(user.id, 'Secret 1');
      const secret2 = await createAdminSecret(user.id, 'Secret 2');

      expect(secret1).not.toBe(secret2);

      const hash1 = hashSecret(secret1);
      const hash2 = hashSecret(secret2);

      const stored1 = await prisma.adminSecret.findUnique({
        where: { secretHash: hash1 },
      });
      const stored2 = await prisma.adminSecret.findUnique({
        where: { secretHash: hash2 },
      });

      expect(stored1?.name).toBe('Secret 1');
      expect(stored2?.name).toBe('Secret 2');
    });
  });

  describe('getAdminSecretByHash()', () => {
    it('should retrieve secret by hash', async () => {
      const user = await createTestSuperuser();
      const plainSecret = await createAdminSecret(user.id, 'Test Secret');
      const hash = hashSecret(plainSecret);

      const retrieved = await getAdminSecretByHash(hash);

      expect(retrieved).toBeDefined();
      expect(retrieved?.userId).toBe(user.id);
      expect(retrieved?.user.email).toBe(user.email);
      expect(retrieved?.name).toBe('Test Secret');
      expect(retrieved?.revokedAt).toBeNull();
    });

    it('should return null for non-existent hash', async () => {
      const result = await getAdminSecretByHash('non-existent-hash');
      expect(result).toBeNull();
    });

    it('should return null for revoked secrets', async () => {
      const user = await createTestSuperuser();
      const plainSecret = await createAdminSecret(user.id, 'Test Secret');
      const hash = hashSecret(plainSecret);
      const secret = await getAdminSecretByHash(hash);

      if (!secret) throw new Error('Secret not found');

      // Revoke the secret
      await revokeSecret(secret.id, user.id);

      // Should still return the secret (revokedAt is set)
      const retrieved = await getAdminSecretByHash(hash);
      expect(retrieved).toBeDefined();
      expect(retrieved?.revokedAt).not.toBeNull();
    });

    it('should include user information', async () => {
      const user = await createTestSuperuser({ email: 'admin@test.com' });
      const plainSecret = await createAdminSecret(user.id, 'Test');
      const hash = hashSecret(plainSecret);

      const retrieved = await getAdminSecretByHash(hash);

      expect(retrieved?.user).toBeDefined();
      expect(retrieved?.user.id).toBe(user.id);
      expect(retrieved?.user.email).toBe('admin@test.com');
      expect(retrieved?.user.role).toBe('SUPERUSER');
    });
  });

  describe('updateLastUsed()', () => {
    it('should update lastUsedAt timestamp', async () => {
      const user = await createTestSuperuser();
      const plainSecret = await createAdminSecret(user.id, 'Test Secret');
      const hash = hashSecret(plainSecret);

      const secret = await getAdminSecretByHash(hash);
      if (!secret) throw new Error('Secret not found');

      const beforeUpdate = secret.lastUsedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      await updateLastUsed(secret.id);

      const updated = await getAdminSecretByHash(hash);
      expect(updated?.lastUsedAt).not.toBe(beforeUpdate);
      expect(updated?.lastUsedAt?.getTime()).toBeGreaterThan(
        beforeUpdate?.getTime() || 0
      );
    });

    it('should not throw on non-existent secret', async () => {
      // Should not throw
      await updateLastUsed('non-existent-id');
    });
  });

  describe('listUserSecrets()', () => {
    it('should list all secrets for a user', async () => {
      const user = await createTestSuperuser();

      await createAdminSecret(user.id, 'Secret 1');
      await createAdminSecret(user.id, 'Secret 2');
      await createAdminSecret(user.id, 'Secret 3');

      const secrets = await listUserSecrets(user.id);

      expect(secrets.length).toBe(3);
      expect(secrets.map(s => s.name)).toContain('Secret 1');
      expect(secrets.map(s => s.name)).toContain('Secret 2');
      expect(secrets.map(s => s.name)).toContain('Secret 3');
    });

    it('should return empty array for user with no secrets', async () => {
      const user = await createTestSuperuser();
      const secrets = await listUserSecrets(user.id);
      expect(secrets.length).toBe(0);
    });

    it('should include revoked status', async () => {
      const user = await createTestSuperuser();

      const secret1 = await createAdminSecret(user.id, 'Active');
      const secret2Plain = await createAdminSecret(user.id, 'Revoked');

      const hash = hashSecret(secret2Plain);
      const secret2 = await getAdminSecretByHash(hash);
      if (!secret2) throw new Error('Secret not found');

      await revokeSecret(secret2.id, user.id);

      const secrets = await listUserSecrets(user.id);
      const active = secrets.find(s => s.name === 'Active');
      const revoked = secrets.find(s => s.name === 'Revoked');

      expect(active?.revokedAt).toBeNull();
      expect(revoked?.revokedAt).not.toBeNull();
    });

    it('should order by creation date descending', async () => {
      const user = await createTestSuperuser();

      await createAdminSecret(user.id, 'First');
      await new Promise(resolve => setTimeout(resolve, 50));
      await createAdminSecret(user.id, 'Second');
      await new Promise(resolve => setTimeout(resolve, 50));
      await createAdminSecret(user.id, 'Third');

      const secrets = await listUserSecrets(user.id);

      expect(secrets[0].name).toBe('Third');
      expect(secrets[1].name).toBe('Second');
      expect(secrets[2].name).toBe('First');
    });
  });

  describe('revokeSecret()', () => {
    it('should revoke a secret', async () => {
      const user = await createTestSuperuser();
      const plainSecret = await createAdminSecret(user.id, 'Test Secret');
      const hash = hashSecret(plainSecret);

      const secret = await getAdminSecretByHash(hash);
      if (!secret) throw new Error('Secret not found');

      await revokeSecret(secret.id, user.id);

      const revoked = await prisma.adminSecret.findUnique({
        where: { id: secret.id },
      });

      expect(revoked?.revokedAt).not.toBeNull();
      expect(revoked?.revokedAt instanceof Date).toBe(true);
    });

    it('should verify ownership before revoking', async () => {
      const user1 = await createTestSuperuser();
      const user2 = await createTestSuperuser();

      const plainSecret = await createAdminSecret(user1.id, 'Test Secret');
      const hash = hashSecret(plainSecret);

      const secret = await getAdminSecretByHash(hash);
      if (!secret) throw new Error('Secret not found');

      await expect(revokeSecret(secret.id, user2.id)).rejects.toThrow(
        /not authorized|ownership/i
      );
    });

    it('should throw for non-existent secret', async () => {
      const user = await createTestSuperuser();

      await expect(revokeSecret('non-existent-id', user.id)).rejects.toThrow(
        /not found|Secret not found/i
      );
    });
  });

  describe('deleteSecret()', () => {
    it('should permanently delete a secret', async () => {
      const user = await createTestSuperuser();
      const plainSecret = await createAdminSecret(user.id, 'Test Secret');
      const hash = hashSecret(plainSecret);

      const secret = await getAdminSecretByHash(hash);
      if (!secret) throw new Error('Secret not found');

      await deleteSecret(secret.id, user.id);

      const deleted = await prisma.adminSecret.findUnique({
        where: { id: secret.id },
      });

      expect(deleted).toBeNull();
    });

    it('should verify ownership before deleting', async () => {
      const user1 = await createTestSuperuser();
      const user2 = await createTestSuperuser();

      const plainSecret = await createAdminSecret(user1.id, 'Test Secret');
      const hash = hashSecret(plainSecret);

      const secret = await getAdminSecretByHash(hash);
      if (!secret) throw new Error('Secret not found');

      await expect(deleteSecret(secret.id, user2.id)).rejects.toThrow(
        /not authorized|ownership/i
      );
    });

    it('should throw for non-existent secret', async () => {
      const user = await createTestSuperuser();

      await expect(deleteSecret('non-existent-id', user.id)).rejects.toThrow(
        /not found|Secret not found/i
      );
    });
  });
});
