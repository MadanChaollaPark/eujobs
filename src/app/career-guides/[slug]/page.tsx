import { notFound } from 'next/navigation';
import { findResourceBySlug, resourceList } from '@/lib/resources';
import { ResourceDetail } from '@/components/ResourceUI';
import { pageMetadata } from '@/lib/page-metadata';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = findResourceBySlug(resourceList('careerGuides'), slug);
  if (!guide) notFound();
  return pageMetadata(
    guide.name,
    guide.summary || `Explore the EUJobs career guide for ${guide.name}.`,
    `/career-guides/${encodeURIComponent(guide.slug)}`,
    { article: true },
  );
}
export default async function Guide({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    item = findResourceBySlug(resourceList('careerGuides'), slug);
  if (!item) notFound();
  return <ResourceDetail item={item} base="/career-guides" label="Career guides" />;
}
