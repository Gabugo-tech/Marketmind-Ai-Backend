/**
 * promote-admin.ts
 *
 * Sets role=ADMIN on the user whose email matches the ADMIN_EMAIL environment
 * variable. Run once after the first deployment / migration.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com npx ts-node src/scripts/promote-admin.ts
 *
 * On Railway, set ADMIN_EMAIL in the environment variables panel and run this
 * script via the Railway shell or as a one-off deploy command.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;

  if (!email) {
    console.error('❌  ADMIN_EMAIL environment variable is not set.');
    console.error('    Usage: ADMIN_EMAIL=you@example.com npx ts-node src/scripts/promote-admin.ts');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

  if (!user) {
    console.error(`❌  No user found with email: ${email}`);
    console.error('    Make sure the account has been registered first.');
    process.exit(1);
  }

  if (user.role === 'ADMIN') {
    console.log(`✅  ${email} is already an ADMIN. Nothing to do.`);
    process.exit(0);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN' },
  });

  console.log(`✅  Successfully promoted ${email} to ADMIN.`);
  console.log(`    User ID: ${user.id}`);
  console.log(`    Name: ${user.firstName} ${user.lastName}`);
}

main()
  .catch((e) => { console.error('Script failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
