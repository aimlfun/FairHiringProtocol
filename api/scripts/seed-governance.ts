/**
 * FHP Governance User Seed
 *
 * Creates or updates governance users in identity.governance_users.
 * Run once after migration 024_governance_users.sql.
 *
 * User definitions are read from environment variables (see api/.env):
 *   GOVERNANCE_ADMIN_USERNAME   — username for the admin user
 *   GOVERNANCE_ADMIN_PASSWORD   — plain-text password (will be hashed)
 *   GOVERNANCE_ADMIN_DISPLAY    — display name shown in the dashboard
 *   GOVERNANCE_USER_USERNAME    — username for the governance officer
 *   GOVERNANCE_USER_PASSWORD    — plain-text password (will be hashed)
 *   GOVERNANCE_USER_DISPLAY     — display name shown in the dashboard
 *
 * Passwords are hashed with bcrypt (cost 12) before storage.
 * Re-running this script is safe — it upserts by username.
 *
 * Usage:
 *   npm run seed:governance
 */

import 'dotenv/config';
import postgres from 'postgres';
import bcrypt   from 'bcrypt';

const BCRYPT_ROUNDS = 12;

interface UserDef {
  username:     string;
  password:     string;
  role:         'governance' | 'admin';
  display_name: string;
}

function readUsers(): UserDef[] {
  const users: UserDef[] = [];

  const adminUser = process.env['GOVERNANCE_ADMIN_USERNAME'];
  const adminPass = process.env['GOVERNANCE_ADMIN_PASSWORD'];
  if (adminUser && adminPass) {
    users.push({
      username:     adminUser,
      password:     adminPass,
      role:         'admin',
      display_name: process.env['GOVERNANCE_ADMIN_DISPLAY'] ?? adminUser,
    });
  }

  const govUser = process.env['GOVERNANCE_USER_USERNAME'];
  const govPass = process.env['GOVERNANCE_USER_PASSWORD'];
  if (govUser && govPass) {
    users.push({
      username:     govUser,
      password:     govPass,
      role:         'governance',
      display_name: process.env['GOVERNANCE_USER_DISPLAY'] ?? govUser,
    });
  }

  if (users.length === 0) {
    console.error(
      'No governance users configured.\n' +
      'Set GOVERNANCE_ADMIN_USERNAME + GOVERNANCE_ADMIN_PASSWORD (and/or\n' +
      'GOVERNANCE_USER_USERNAME + GOVERNANCE_USER_PASSWORD) in api/.env'
    );
    process.exit(1);
  }

  return users;
}

async function main() {
  const db    = postgres(process.env['IDENTITY_DATABASE_URL'] ?? process.env['DATABASE_URL']!, { max: 1 });
  const users = readUsers();

  try {
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
      await db`
        INSERT INTO identity.governance_users (username, password_hash, role, display_name)
        VALUES (${u.username.toLowerCase()}, ${hash}, ${u.role}, ${u.display_name})
        ON CONFLICT (username) DO UPDATE
          SET password_hash = EXCLUDED.password_hash,
              role          = EXCLUDED.role,
              display_name  = EXCLUDED.display_name
      `;
      console.log(`✓ ${u.role.padEnd(10)} ${u.username}  (${u.display_name})`);
    }
    console.log('\nGovernance users seeded successfully.');
  } finally {
    await db.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
