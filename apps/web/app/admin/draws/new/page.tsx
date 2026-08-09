'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import styles from '../../draw-management.module.css';

async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (typeof body.message === 'string') return body.message;
  } catch {}

  return `Request failed with status ${response.status}`;
}

function iso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function NewDrawPage() {
  const router = useRouter();
  const [type, setType] = useState('WEEKLY');
  const [scheduledDrawAt, setScheduledDrawAt] = useState('');
  const [salesOpenAt, setSalesOpenAt] = useState('');
  const [salesCloseAt, setSalesCloseAt] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [ticketPriceMinor, setTicketPriceMinor] = useState('100');
  const [winnerCount, setWinnerCount] = useState('3');
  const [participationYear, setParticipationYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const scheduled = iso(scheduledDrawAt);
      if (!scheduled) throw new Error('Scheduled draw date is required.');

      const response = await fetch('/api/admin/draws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          scheduledDrawAt: scheduled,
          ...(salesOpenAt ? { salesOpenAt: iso(salesOpenAt) } : {}),
          ...(salesCloseAt ? { salesCloseAt: iso(salesCloseAt) } : {}),
          currency: currency.toUpperCase(),
          ticketPriceMinor,
          winnerCount: Number(winnerCount),
          ...(participationYear
            ? { participationYear: Number(participationYear) }
            : {}),
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Permission denied. draw.create is required.');
        }
        throw new Error(await readMessage(response));
      }

      const draw = (await response.json()) as { id: string };
      router.push(`/admin/draws/${encodeURIComponent(draw.id)}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to create draw.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin">← Admin dashboard</Link>
        <Link href="/">Amazing Chance</Link>
      </header>

      <h1>Create lottery draw</h1>
      <p className={styles.muted}>
        Backend validation and draw.create permission remain authoritative.
      </p>

      <section className={styles.panel}>
        <form className={styles.form} onSubmit={submit}>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="WEEKLY">Weekly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </label>

          <label>
            Scheduled draw
            <input
              type="datetime-local"
              value={scheduledDrawAt}
              onChange={(e) => setScheduledDrawAt(e.target.value)}
              required
            />
          </label>

          <label>
            Sales open
            <input
              type="datetime-local"
              value={salesOpenAt}
              onChange={(e) => setSalesOpenAt(e.target.value)}
            />
          </label>

          <label>
            Sales close
            <input
              type="datetime-local"
              value={salesCloseAt}
              onChange={(e) => setSalesCloseAt(e.target.value)}
            />
          </label>

          <label>
            Currency
            <input
              value={currency}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              required
            />
          </label>

          <label>
            Ticket price, minor units
            <input
              value={ticketPriceMinor}
              inputMode="numeric"
              onChange={(e) => setTicketPriceMinor(e.target.value)}
              required
            />
          </label>

          <label>
            Winner count
            <input
              type="number"
              min={1}
              max={100}
              value={winnerCount}
              onChange={(e) => setWinnerCount(e.target.value)}
              required
            />
          </label>

          <label>
            Participation year
            <input
              type="number"
              min={2000}
              max={9999}
              value={participationYear}
              onChange={(e) => setParticipationYear(e.target.value)}
              placeholder="Optional"
            />
          </label>

          {error ? <p className={`${styles.error} ${styles.full}`}>{error}</p> : null}

          <button className={`${styles.button} ${styles.full}`} disabled={saving}>
            {saving ? 'Creating...' : 'Create draw'}
          </button>
        </form>
      </section>
    </main>
  );
}
