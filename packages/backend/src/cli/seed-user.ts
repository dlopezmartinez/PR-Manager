#!/usr/bin/env node

import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
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

async function seedUser() {
  console.log('\n🌱 Create Test SUPERUSER\n');

  const email = await question('Enter email: ');
  const password = await question('Enter password (or press Enter for "password"): ');
  const name = await question('Enter name (optional): ');

  if (!email) {
    console.log('❌ Email required');
    rl.close();
    process.exit(1);
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      console.log(`⚠️  User already exists: ${email}`);
      rl.close();
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password || 'password', 10);

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        passwordHash,
        role: 'SUPERUSER',
        isActive: true,
        isSuspended: false,
      },
    });

    console.log(`\n✅ SUPERUSER created successfully!\n`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`🔑 Password: ${password || 'password'}`);
    console.log(`👤 Name: ${user.name || '(not set)'}`);
    console.log(`⭐ Role: ${user.role}\n`);

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating user:', error);
    rl.close();
    process.exit(1);
  }
}

seedUser();
