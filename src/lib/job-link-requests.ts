import { z } from 'zod';
import { getDb, saveContact } from './store';
import { appOrigin, emailAvailable, enqueueEmail } from './email';
export const jobLinkSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(2000)
      .pipe(z.url({ protocol: /^https?$/ })),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    organization: z.string().trim().max(150).optional().default(''),
    source: z.enum(['submit', 'pricing']).optional().default('submit'),
  })
  .strict();
export function adminNotificationEmails(): string[] {
  const configured = [process.env.CONTACT_INBOX_EMAIL, process.env.EUJOBS_ADMIN_EMAIL].filter(
    (v): v is string => z.email().safeParse(v).success,
  );
  if (configured.length) return [...new Set(configured)];
  const rows = getDb().prepare("SELECT email FROM users WHERE role='admin' ORDER BY email").all();
  return rows
    .map((r) => String((r as { email: string }).email))
    .filter((e) => z.email().safeParse(e).success);
}
/** Saved to the administrator contact inbox; the email is a notification only. */
export function saveJobLinkRequest(input: z.infer<typeof jobLinkSchema>) {
  const name = input.organization.length >= 2 ? input.organization : 'Job link request';
  const saved = saveContact({
    name,
    email: input.email,
    subject: 'Post my job from a link',
    message: `Please post this job for us:\n${input.url}\n\nOrganisation: ${input.organization || '(not given)'}\nContact: ${input.email}\nForm: ${input.source}`,
  });
  let notified = 0;
  if (emailAvailable())
    for (const to of adminNotificationEmails()) {
      try {
        enqueueEmail({
          to,
          subject: `EUJobs: new "post my job" link from ${input.organization || input.email}`,
          text: `A visitor asked us to post their job.\n\nJob link: ${input.url}\nOrganisation: ${input.organization || '(not given)'}\nContact email: ${input.email}\nForm: ${input.source}\n\nReference: ${saved.id}\nContact inbox: ${appOrigin()}/account`,
          idempotencyKey: `job-link:${saved.id}:${to}`,
        });
        notified++;
      } catch {
        console.error('Job link notification queue failed; request retained in contact inbox.');
      }
    }
  return { reference: saved.id, notified };
}
