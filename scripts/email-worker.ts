import './env';
import { alertEmailEligible, queueJobAlerts } from '../src/lib/alerts';
import { emailAvailable, emailQueueSummary, processEmailOutbox } from '../src/lib/email';

async function main() {
  const run = process.argv.includes('--run') && !process.argv.includes('--dry-run');
  if (!run) {
    console.log(
      JSON.stringify({
        mode: 'dry-run',
        available: emailAvailable(),
        matching: queueJobAlerts({ dryRun: true }),
        queue: emailQueueSummary(),
      }),
    );
    return;
  }
  if (!emailAvailable()) {
    console.log(
      JSON.stringify({
        mode: 'disabled',
        reason:
          'Configure a working email provider and sender, with EMAIL_DELIVERY_ENABLED enabled.',
      }),
    );
    return;
  }
  const matching = queueJobAlerts({ dryRun: false });
  const delivery = await processEmailOutbox({ eligible: alertEmailEligible });
  console.log(JSON.stringify({ mode: 'run', matching, delivery, queue: emailQueueSummary() }));
}
main().catch(() => {
  console.error('Email worker failed. Check database and email configuration.');
  process.exitCode = 1;
});
