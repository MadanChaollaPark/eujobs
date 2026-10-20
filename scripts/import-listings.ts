import './env';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EDITORIAL_SOURCES, findUserByEmail, importEditorialListings } from '../src/lib/store';

// Explicit operator input only. No scraping, schedules, fake purchases, or provider calls.
// Default is validation. --apply creates editorial drafts; --apply --publish publishes checked rows.
const args = process.argv.slice(2);
const option = (key: string) => {
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] : undefined;
};
function main() {
  const allowed = new Set(['--file', '--source', '--owner', '--admin', '--apply', '--publish']);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Unknown argument: ${args[i]}`);
    if (['--file', '--source', '--owner', '--admin'].includes(args[i])) i++;
  }
  const file = option('--file'),
    source = z.enum(EDITORIAL_SOURCES).parse(option('--source'));
  const email = option('--admin') || option('--owner');
  if (!file || !email)
    throw new Error(
      'Usage: npm run import:listings -- --file input.json --source eurobrussels.com|jobsin.brussels --admin ADMIN_EMAIL [--apply] [--publish]',
    );
  const raw = readFileSync(file);
  if (raw.length > 10 * 1024 * 1024)
    throw new Error('Import file exceeds 10 MiB. Split it into smaller batches.');
  const actor = findUserByEmail(email);
  if (!actor || actor.role !== 'admin')
    throw new Error('The named account must be an existing administrator.');
  const result = importEditorialListings(actor.id, source, JSON.parse(raw.toString('utf8')), {
    dryRun: !args.includes('--apply'),
    publish: args.includes('--publish'),
    sha256: createHash('sha256').update(raw).digest('hex'),
  });
  console.log(JSON.stringify(result));
}
try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Import failed.');
  process.exitCode = 1;
}
