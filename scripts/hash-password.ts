#!/usr/bin/env bun

/**
 * Hash a password using Argon2id
 * Usage: bun run scripts/hash-password.ts <password>
 */

import { hashPassword } from '../backend/src/utils/password';

const password = process.argv[2];

if (!password) {
  console.error('Usage: bun run scripts/hash-password.ts <password>');
  process.exit(1);
}

const hash = await hashPassword(password);
console.log('\nGenerated hash:');
console.log(hash);
console.log('\nAdd this to your .env file:');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
