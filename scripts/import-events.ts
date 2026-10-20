import './env';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { findUserByEmail, importOrganizerEvents } from '../src/lib/store';

try {
  const args = process.argv.slice(2);
  let file: string | undefined,
    email: string | undefined,
    apply = false,
    publish = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true;
    else if (args[i] === '--publish') publish = true;
    else if (args[i] === '--file' || args[i] === '--admin') {
      const flag = args[i],
        value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
      if (flag === '--file') file = value;
      else email = value;
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!file || !email)
    throw new Error(
      'Usage: npm run import:events -- --file reviewed.json --admin ADMIN_EMAIL [--apply] [--publish]',
    );
  const raw = readFileSync(file);
  if (raw.length > 10 * 1024 * 1024) throw new Error('Event import exceeds 10 MiB.');
  const actor = findUserByEmail(email);
  if (!actor || actor.role !== 'admin') throw new Error('An existing administrator is required.');
  console.log(
    JSON.stringify(
      importOrganizerEvents(actor.id, JSON.parse(raw.toString('utf8')), {
        dryRun: !apply,
        publish,
        sha256: createHash('sha256').update(raw).digest('hex'),
      }),
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Event import failed.');
  process.exitCode = 1;
}
