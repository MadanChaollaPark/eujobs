import { z } from 'zod';
import { saveContact } from '@/lib/store';
import { appOrigin, emailAvailable, enqueueEmail } from '@/lib/email';
import { clientKey, errorResponse, json, protectMutation, rateLimit, readJson } from '../_shared';
export const runtime = 'nodejs';
const schema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    subject: z.string().trim().min(3).max(150),
    message: z.string().trim().min(10).max(5000),
  })
  .strict();
export async function POST(request: Request) {
  try {
    protectMutation(request);
    rateLimit(`contact:client:${clientKey(request)}`, 20, 60 * 60 * 1000);
    const input = schema.parse(await readJson(request, 32 * 1024));
    rateLimit(`contact:email:${input.email}`, 5, 60 * 60 * 1000);
    const saved = saveContact(input);
    // The durable team inbox remains authoritative if provider delivery is unavailable.
    if (emailAvailable() && z.email().safeParse(process.env.CONTACT_INBOX_EMAIL).success) {
      try {
        enqueueEmail({
          to: process.env.CONTACT_INBOX_EMAIL!,
          subject: `EUJobs contact: ${input.subject}`,
          text: `${input.name} (${input.email})\n\n${input.message}\n\nReference: ${saved.id}\nReview: ${appOrigin()}/account`,
          idempotencyKey: `contact:${saved.id}`,
        });
      } catch {
        console.error('Contact notification queue failed; message retained in team inbox.');
      }
    }
    return json(
      { message: 'Your message has been saved for the EUJobs team.', reference: saved.id },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
