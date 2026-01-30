#!/usr/bin/env node

import { createAdminSecret, listUserSecrets, revokeSecret } from '../services/adminSecretService.js';
import { prisma } from '../lib/prisma.js';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function findUserByEmail(email: string) {
  return await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, name: true },
  });
}

async function createSecret() {
  console.log('\n📝 Create Admin Secret\n');

  const email = await question('Enter superuser email: ');
  if (!email) {
    console.log('❌ Email required');
    process.exit(1);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    console.log(`❌ User not found: ${email}`);
    process.exit(1);
  }

  if (user.role !== 'SUPERUSER') {
    console.log(`❌ User is not SUPERUSER (current role: ${user.role})`);
    process.exit(1);
  }

  const secretName = await question('Enter secret name (e.g., "Postman", "CI/CD"): ');
  if (!secretName) {
    console.log('❌ Secret name required');
    process.exit(1);
  }

  try {
    const plainSecret = await createAdminSecret(user.id, secretName);

    console.log('\n✅ Secret Created!\n');
    console.log(`👤 User: ${user.email}`);
    console.log(`📌 Name: ${secretName}`);
    console.log('\n🔐 Your Secret (save this somewhere safe):\n');
    console.log(`   ${plainSecret}\n`);
    console.log('📋 Use in Postman header:\n');
    console.log(`   Authorization: AdminSecret ${plainSecret}\n`);
    console.log('⚠️  You will NOT see this secret again. Save it now!\n');

    process.exit(0);
  } catch (error) {
    console.log(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function listSecrets() {
  console.log('\n📋 List Admin Secrets\n');

  const email = await question('Enter superuser email: ');
  if (!email) {
    console.log('❌ Email required');
    process.exit(1);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    console.log(`❌ User not found: ${email}`);
    process.exit(1);
  }

  try {
    const secrets = await listUserSecrets(user.id);

    if (secrets.length === 0) {
      console.log(`\nNo secrets found for ${email}\n`);
      process.exit(0);
    }

    console.log(`\n👤 ${email}\n`);
    secrets.forEach((secret, i) => {
      const status = secret.revokedAt ? '🔴 REVOKED' : '🟢 ACTIVE';
      const lastUsed = secret.lastUsedAt
        ? new Date(secret.lastUsedAt).toLocaleString()
        : 'Never';
      console.log(`${i + 1}. ${secret.name} ${status}`);
      console.log(`   Created: ${new Date(secret.createdAt).toLocaleString()}`);
      console.log(`   Last used: ${lastUsed}`);
      console.log();
    });

    process.exit(0);
  } catch (error) {
    console.log(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function revokeSecretCmd() {
  console.log('\n🔴 Revoke Admin Secret\n');

  const email = await question('Enter superuser email: ');
  if (!email) {
    console.log('❌ Email required');
    process.exit(1);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    console.log(`❌ User not found: ${email}`);
    process.exit(1);
  }

  try {
    const secrets = await listUserSecrets(user.id);

    if (secrets.length === 0) {
      console.log(`\nNo secrets found for ${email}\n`);
      process.exit(0);
    }

    console.log(`\n${email}'s secrets:\n`);
    secrets
      .filter((s) => !s.revokedAt)
      .forEach((secret, i) => {
        console.log(`${i + 1}. ${secret.name}`);
      });

    const choice = await question('\nEnter number to revoke (or 0 to cancel): ');
    const index = parseInt(choice) - 1;

    if (index < 0) {
      console.log('\n❌ Cancelled\n');
      process.exit(0);
    }

    const activeSecrets = secrets.filter((s) => !s.revokedAt);
    if (index >= activeSecrets.length) {
      console.log('\n❌ Invalid choice\n');
      process.exit(1);
    }

    const secretToRevoke = activeSecrets[index];
    const confirm = await question(`\nRevoke "${secretToRevoke.name}"? (yes/no): `);

    if (confirm.toLowerCase() !== 'yes') {
      console.log('\n❌ Cancelled\n');
      process.exit(0);
    }

    await revokeSecret(secretToRevoke.id, user.id);
    console.log(`\n✅ Secret "${secretToRevoke.name}" revoked\n`);
    process.exit(0);
  } catch (error) {
    console.log(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'list':
      await listSecrets();
      break;
    case 'revoke':
      await revokeSecretCmd();
      break;
    default:
      await createSecret();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
