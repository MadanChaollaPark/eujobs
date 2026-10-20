import './env';
import { z } from 'zod';
import { hashPassword } from '../src/lib/auth';
import { createUser, findUserByEmail, setUserRole } from '../src/lib/store';

async function main() {
  const args = process.argv.slice(2);
  function argument(name: string) {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  }
  const email = z.email().max(254).parse(argument('--email')).toLowerCase();
  const existing = findUserByEmail(email);
  if (args.includes('--promote')) {
    if (!existing)
      throw new Error(
        'No account exists for this email. Register first or create it with --name and EUJOBS_ADMIN_PASSWORD.',
      );
    setUserRole(existing.id, 'admin');
    console.log(`Administrator access granted to ${email}.`);
    return;
  }
  if (existing)
    throw new Error(
      'An account already exists. Use --promote explicitly to grant administrator access.',
    );
  const name = z.string().trim().min(2).max(100).parse(argument('--name'));
  const password = process.env.EUJOBS_ADMIN_PASSWORD;
  if (!password)
    throw new Error(
      'Set EUJOBS_ADMIN_PASSWORD explicitly. No default administrator credentials exist.',
    );
  createUser({ name, email, passwordHash: await hashPassword(password), role: 'admin' });
  console.log(`Administrator account created for ${email}.`);
}
main().catch((error) => {
  console.error(
    error instanceof z.ZodError
      ? 'Usage: npm run admin -- --email you@example.org --name "Your name" (EUJOBS_ADMIN_PASSWORD required), or --email you@example.org --promote.'
      : error instanceof Error
        ? error.message
        : 'Administrator setup failed.',
  );
  process.exitCode = 1;
});
