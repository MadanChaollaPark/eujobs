import { pageMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import { CATEGORIES } from '@/lib/categories';
import { ResourcePage } from '@/components/ResourceUI';
export const metadata = pageMetadata(
  'Job categories',
  'Browse European affairs jobs by organization sector and career path, including policy, advocacy and traineeships.',
  '/categories',
);
export default function Categories() {
  return (
    <ResourcePage
      title="Find your place in European affairs."
      eyebrow="JOB CATEGORIES"
      intro="Browse opportunities by organization sector and career path."
    >
      <div className="resource-grid">
        {CATEGORIES.map((category) => (
          <article className="resource-card" key={category.slug}>
            <h2>
              <Link href={`/categories/${category.slug}`}>{category.name}</Link>
            </h2>
            <p>{category.description}</p>
            <Link className="text-link" href={`/categories/${category.slug}`}>
              Explore jobs →
            </Link>
          </article>
        ))}
      </div>
    </ResourcePage>
  );
}
