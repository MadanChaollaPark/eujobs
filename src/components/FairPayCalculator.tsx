'use client';
import { useState } from 'react';
const ranges = {
  Consultancy: [
    [2500, 3500],
    [3500, 5500],
    [6000, 10000],
  ],
  'Trade association': [
    [2000, 3000],
    [3000, 4500],
    [4500, 6000],
  ],
  'In-house / corporate': [
    [2800, 4500],
    [4500, 7500],
    [7500, 12000],
  ],
  'NGO / nonprofit': [
    [2000, 3000],
    [3000, 4500],
    [4500, 6000],
  ],
} as const;
export default function FairPayCalculator() {
  const [sector, setSector] = useState<keyof typeof ranges>('Consultancy'),
    [level, setLevel] = useState(1);
  const [low, high] = ranges[sector][level],
    money = (n: number) =>
      new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(n);
  return (
    <div className="resource-card fairpay-calculator">
      <div className="resource-filter">
        <label>
          Organization type
          <select value={sector} onChange={(e) => setSector(e.target.value as keyof typeof ranges)}>
            {Object.keys(ranges).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Seniority
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
            {['Junior', 'Mid-level', 'Senior'].map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="fairpay-result" aria-live="polite">
        <p className="eyebrow">GROSS MONTHLY REFERENCE RANGE · BRUSSELS</p>
        <strong>
          {money(low)} – {money(high)}
        </strong>
        <p>Midpoint {money((low + high) / 2)}</p>
        <div className="fairpay-track" aria-hidden="true">
          <span style={{ left: `${low / 120}%`, width: `${(high - low) / 120}%` }} />
        </div>
        <p>
          Annual equivalent (12 months):{' '}
          <b>
            {money(low * 12)} – {money(high * 12)}
          </b>
        </p>
      </div>
      <p className="resource-note">
        These indicative bands are carried over from the earlier EUJobs calculator. They are
        historical editorial estimates, not a current salary survey. Benefits, bonuses, holiday pay,
        taxes and individual circumstances are excluded.
      </p>
      <a
        className="text-link"
        href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Feujobs.co%2Ffairpay"
        target="_blank"
        rel="noopener noreferrer"
      >
        Share the calculator on LinkedIn ↗
      </a>
    </div>
  );
}
