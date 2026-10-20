'use client';
import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CATEGORIES } from '@/lib/categories';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import {
  TOPICS,
  WORK_MODES,
  EMPLOYMENT_TYPES,
  SENIORITIES,
  EVENT_TYPES,
  type ListingKind,
} from '@/lib/types';
export default function FilterPanel({ kind }: { kind: ListingKind }) {
  const params = useSearchParams();
  const router = useRouter();
  const [pending, start] = useTransition();
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key === 'from' && value && next.get('to') && value > next.get('to')!) next.delete('to');
    next.delete('page');
    start(() => router.push(`/${kind === 'job' ? 'jobs' : 'events'}?${next}`, { scroll: false }));
  }
  function options(key: string, label: string, values: readonly string[]) {
    return (
      <label className="filter-field">
        <span>{label}</span>
        <select value={params.get(key) || ''} onChange={(e) => update(key, e.target.value)}>
          <option value="">Any {label.toLowerCase()}</option>
          {values.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <aside className={`filter-panel ${pending ? 'loading-filters' : ''}`} aria-busy={pending}>
      <div className="filter-title">
        <h2>
          <SlidersHorizontal size={17} /> Refine your search
        </h2>
        <button
          className="icon-button"
          onClick={() => {
            const next = new URLSearchParams();
            if (params.get('q')) next.set('q', params.get('q')!);
            router.push(`/${kind === 'job' ? 'jobs' : 'events'}?${next}`, { scroll: false });
          }}
          aria-label="Reset filters"
        >
          <RotateCcw size={14} />
        </button>
      </div>
      {options('topic', 'Policy area', TOPICS)}
      <label className="filter-field">
        <span>Organization category</span>
        <select
          value={params.get('categorySlug') || ''}
          onChange={(event) => update('categorySlug', event.target.value)}
        >
          <option value="">Any category</option>
          {CATEGORIES.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      {params.get('policyTag') && (
        <label className="filter-field">
          <span>Policy tag</span>
          <select
            value={params.get('policyTag') || ''}
            onChange={(event) => update('policyTag', event.target.value)}
          >
            <option value="">Any tag</option>
            <option>{params.get('policyTag')}</option>
          </select>
        </label>
      )}
      {kind === 'job' ? (
        <>
          {options('workMode', 'Work style', WORK_MODES)}
          {options('employmentType', 'Contract', EMPLOYMENT_TYPES)}
          {options('seniority', 'Experience', SENIORITIES)}
          <label className="check-field">
            <input
              type="checkbox"
              checked={params.get('salaryOnly') === 'true'}
              onChange={(e) => update('salaryOnly', e.target.checked ? 'true' : '')}
            />
            Only show disclosed salaries
          </label>
        </>
      ) : (
        <>
          {options('eventType', 'Event format', EVENT_TYPES)}
          <label className="filter-field">
            <span>From date</span>
            <input
              type="date"
              value={params.get('from') || ''}
              onChange={(e) => update('from', e.target.value)}
            />
          </label>
          <label className="filter-field">
            <span>To date</span>
            <input
              type="date"
              min={params.get('from') || undefined}
              value={params.get('to') || ''}
              onChange={(e) => update('to', e.target.value)}
            />
          </label>
          <p className="filter-date-note">Dates in Europe/Brussels</p>
        </>
      )}
      <div className="filter-note">
        <span className="live-dot" />
        Filtering the complete inventory
      </div>
    </aside>
  );
}
