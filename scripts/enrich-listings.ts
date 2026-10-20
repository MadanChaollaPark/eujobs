import './env';
import { readFileSync } from 'node:fs';
import { enrichEditorialListings, findUserByEmail } from '../src/lib/store';

try {
  const args = process.argv.slice(2);
  let file: string | undefined,
    email: string | undefined,
    apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true;
    else if (args[i] === '--file' || args[i] === '--admin') {
      const name = args[i],
        value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`);
      if (name === '--file') file = value;
      else email = value;
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!file || !email)
    throw new Error(
      'Usage: npm run enrich:listings -- --file reviewed.json --admin ADMIN_EMAIL [--apply]',
    );
  const raw = readFileSync(file);
  if (raw.length > 10 * 1024 * 1024) throw new Error('Enrichment input exceeds 10 MiB.');
  const actor = findUserByEmail(email);
  if (!actor || actor.role !== 'admin') throw new Error('An existing administrator is required.');
  console.log(
    JSON.stringify(
      enrichEditorialListings(actor.id, JSON.parse(raw.toString('utf8')), { dryRun: !apply }),
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Enrichment failed.');
  process.exitCode = 1;
}
