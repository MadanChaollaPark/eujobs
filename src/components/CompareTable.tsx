import Link from 'next/link';
import { JOB_PLANS, formatJobPrice } from '@/lib/plans';
import { firstFreeActive, launchOfferActive } from '@/lib/offers';
export default function CompareTable({ highlight }: { highlight?: 'eurobrussels' | 'jobsin' }) {
  const rows: { name: string; price: string; duration: string; key?: string }[] = [
    {
      name: 'EUJobs',
      price: `Basic ${formatJobPrice(JOB_PLANS.basic.amount)} · Pro ${formatJobPrice(JOB_PLANS.pro.amount)}${launchOfferActive() ? ', or €149 with code LAUNCH149 until 31 October 2026' : ''}${firstFreeActive() ? ' · First listing free (Basic, 30 days) with code FIRSTFREE until 30 November 2026' : ''}`,
      duration: '30 days after approval',
    },
    {
      key: 'eurobrussels',
      name: 'EuroBrussels',
      price: 'Standard Job €990 (ex. VAT) · High Visibility Job €1,830 (ex. VAT)',
      duration: 'Up to 6 weeks (Standard)',
    },
    {
      name: 'BrusselsJobs',
      price: 'Standard Job €760 (ex. VAT) · High Visibility Job €1,160 (ex. VAT)',
      duration: 'Up to 6 weeks (Standard)',
    },
    {
      key: 'jobsin',
      name: 'Jobs in Brussels (jobsin.brussels)',
      price: 'See their site',
      duration: 'See their site',
    },
  ];
  return (
    <>
      <div className="table-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Job board</th>
              <th scope="col">Price for one job ad</th>
              <th scope="col">Time online</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.name}
                style={r.key && r.key === highlight ? { fontWeight: 600 } : undefined}
              >
                <th scope="row">{r.name}</th>
                <td>{r.price}</td>
                <td>{r.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Competitor prices are as published on their own websites (checked 15 Oct 2026). Prices and
        features can change; check each site before you buy. Each board offers different features,
        audiences and discounts (for example for NGOs or internships). EUJobs prices are the amounts
        charged at checkout, with an invoice provided.
      </p>
      <p>
        <Link
          className="button"
          href={firstFreeActive() ? '/submit?kind=job&plan=basic' : '/submit?kind=job'}
        >
          {firstFreeActive()
            ? 'Post your first job free'
            : `Post a job from ${formatJobPrice(JOB_PLANS.basic.amount)}`}{' '}
          →
        </Link>{' '}
        <Link className="text-link" href="/pricing">
          See EUJobs plans
        </Link>
      </p>
    </>
  );
}
