import { getListingById, searchListings } from '../store';
import { isLive, listingHref, type Listing } from '../types';
import { plainContent, safeWebUrl, siteOrigin } from '../resources';
import {
  AgentError,
  type AgentBackend,
  type Kind,
  jobSearchSchema,
  eventSearchSchema,
  identifierSchema,
  listingSchema,
  detailSchema,
} from './contract';

function publicListing(l: Listing) {
  const result = listingSchema.safeParse({
    id: l.id,
    kind: l.kind,
    title: plainContent(l.title),
    organization: plainContent(l.organization),
    location: l.location,
    country: l.country,
    topic: l.topic,
    summary: plainContent(l.summary),
    canonicalUrl: new URL(listingHref(l), siteOrigin()).href,
    publishedAt: l.publishedAt,
    updatedAt: l.updatedAt,
    sourceUrl: safeWebUrl(l.employerSourceUrl || l.sourceUrl) || null,
    sourceCheckedAt: l.sourceCheckedAt,
    deadline: l.deadline,
    timezone: l.timezone,
    employmentType: l.employmentType,
    seniority: l.seniority,
    workMode: l.workMode,
    salary: {
      min: l.salaryMin,
      max: l.salaryMax,
      currency: l.salaryMin === null && l.salaryMax === null ? null : 'EUR',
      period: l.salaryPeriod,
      display: l.salaryDisplay || null,
    },
    startsAt: l.startsAt,
    endsAt: l.endsAt,
    eventType: l.eventType,
    dateOnly: l.eventDateOnly === true,
    application: {
      url: safeWebUrl(l.url) || null,
      method: l.kind === 'job' ? l.applicationMethod || (l.url ? 'url' : null) : null,
      aiApplicationsBlocked: l.blockAIApplications ?? null,
    },
  });
  if (!result.success)
    throw new AgentError('INTERNAL_ERROR', 'Listing metadata could not be read.', 500);
  return result.data;
}
export const agentService: AgentBackend = {
  search(kind: Kind, input: unknown) {
    const { publishedAfter, ...filters } = (
      kind === 'job' ? jobSearchSchema : eventSearchSchema
    ).parse(input);
    const result = searchListings(
      { ...filters, kind },
      { excludeSamples: true, publishedAfter, chronological: true },
    );
    return {
      apiVersion: '1',
      ...result,
      items: result.items.map(publicListing),
      nextPage: result.page < result.pages ? result.page + 1 : null,
      retrievedAt: new Date().toISOString(),
    };
  },
  get(kind: Kind, id: string) {
    const listing = getListingById(identifierSchema.parse(id));
    if (!listing || listing.kind !== kind || listing.isSample || !isLive(listing))
      throw new AgentError('NOT_FOUND', 'No active public listing exists with that ID.', 404);
    const item = detailSchema.safeParse({
      ...publicListing(listing),
      description: plainContent(listing.description),
      applicationInstructions: listing.applicationInstructions
        ? plainContent(listing.applicationInstructions)
        : null,
      venue: listing.venue,
      price: listing.price,
    });
    if (!item.success)
      throw new AgentError('INTERNAL_ERROR', 'Listing metadata could not be read.', 500);
    return { apiVersion: '1', item: item.data, retrievedAt: new Date().toISOString() };
  },
};
