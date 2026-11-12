/**
 * generate-hashes.js — One-shot script to produce bcrypt hashes for seeding database.json users.
 * Run with: node generate-hashes.js
 */
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

const users = [
  { id: 'USR-001', name: 'Dr. K. Ramanathan',    email: 'admin@trust.org',      password: 'Admin123',   role: 'Admin'          },
  { id: 'USR-002', name: 'Mrs. S. Meenakshi',    email: 'accountant@trust.org', password: 'Account123', role: 'Accountant'     },
  { id: 'USR-003', name: 'Er. P. Shanmugam',     email: 'manager@trust.org',    password: 'Manager123', role: 'ProjectManager' },
  { id: 'USR-004', name: 'Adv. R. Venkataraman', email: 'viewer@trust.org',     password: 'View123',    role: 'Viewer'         },
];

(async () => {
  const result = [];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, SALT_ROUNDS);
    result.push({ ...u, passwordHash: hash });
  }
  // Print JSON-ready object for copy-paste
  console.log('USERS_WITH_HASHES:');
  console.log(JSON.stringify(result, null, 2));
})();
