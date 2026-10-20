import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import {
  listOwned,
  getSavedIds,
  getListingById,
  getSavedSearches,
  searchListings,
  listModeration,
  listContacts,
} from '@/lib/store';
import { Listing } from '@/lib/types';
import AccountPanel from '@/components/AccountPanel';
import AccountSecurity from '@/components/AccountSecurity';
import { isEmailVerified } from '@/lib/account-tokens';
import { emailAvailable } from '@/lib/email';
import { listAccountAlerts } from '@/lib/alerts';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your account', robots: { index: false, follow: false } };
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/login?returnTo=%2Faccount');
  const owned = listOwned(user.id);
  const saved = getSavedIds(user.id)
    .map((id) => getListingById(id))
    .filter(
      (listing): listing is Listing =>
        !!listing && ['published', 'closed'].includes(listing.status),
    );
  const searches = getSavedSearches(user.id).map((search) => {
    const result = searchListings({ ...search.filters, page: 1, pageSize: 3 });
    return { ...search, matches: result.items, total: result.total };
  });
  return (
    <div className="container flow-page">
      <AccountPanel
        user={user}
        owned={owned}
        saved={saved}
        searches={searches}
        moderation={user.role === 'admin' ? listModeration() : []}
        contacts={user.role === 'admin' ? listContacts().map((message) => ({ ...message })) : []}
      />
      <AccountSecurity
        verified={isEmailVerified(user.id)}
        available={emailAvailable()}
        alerts={isEmailVerified(user.id) ? listAccountAlerts(user.email) : []}
      />
    </div>
  );
}
