'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import styles from '../../draw-management.module.css';

type Draw = {
  id: string;
  publicId: string;
  type: string;
  status: string;
  participationYear: number | null;
  salesOpenAt: string | null;
  salesCloseAt: string | null;
  scheduledDrawAt: string;
  currency: string;
  ticketPriceMinor: string;
  winnerCount: number;
};

async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (typeof body.message === 'string') return body.message;
  } catch {
    // Response was not JSON.
  }

  return `Request failed with status ${response.status}`;
}

function local(value: string | null): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const adjusted = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );

  return adjusted.toISOString().slice(0, 16);
}

function iso(value: string): string | undefined {
  if (!value) return undefined;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function DrawDetailPage() {
  const params = useParams<{ drawId: string }>();

  const [draw, setDraw] = useState<Draw | null>(null);
  const [scheduledDrawAt, setScheduledDrawAt] = useState('');
  const [salesOpenAt, setSalesOpenAt] = useState('');
  const [salesCloseAt, setSalesCloseAt] = useState('');
  const [currency, setCurrency] = useState('');
  const [ticketPriceMinor, setTicketPriceMinor] = useState('');
  const [winnerCount, setWinnerCount] = useState('');
  const [participationYear, setParticipationYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/admin/draws/${encodeURIComponent(params.drawId)}`,
      { cache: 'no-store' },
    );

    if (!response.ok) {
      throw new Error(await readMessage(response));
    }

    const value = (await response.json()) as Draw;

    setDraw(value);
    setScheduledDrawAt(local(value.scheduledDrawAt));
    setSalesOpenAt(local(value.salesOpenAt));
    setSalesCloseAt(local(value.salesCloseAt));
    setCurrency(value.currency);
    setTicketPriceMinor(value.ticketPriceMinor);
    setWinnerCount(String(value.winnerCount));
    setParticipationYear(
      value.participationYear ? String(value.participationYear) : '',
    );
  }, [params.drawId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load()
        .catch((requestError: unknown) => {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load draw.',
          );
        })
        .finally(() => {
          setLoading(false);
        });
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draw || draw.status !== 'SCHEDULED') {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const scheduled = iso(scheduledDrawAt);

      if (!scheduled) {
        throw new Error('Scheduled draw date is required.');
      }

      const response = await fetch(
        `/api/admin/draws/${encodeURIComponent(draw.id)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
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
        },
      );

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Permission denied. draw.update is required.');
        }

        throw new Error(await readMessage(response));
      }

      await load();
      setNotice('Draw configuration updated.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to update draw.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        Loading draw...
      </main>
    );
  }

  if (!draw) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>
          {error ?? 'Draw not found.'}
        </p>
      </main>
    );
  }

  const editable = draw.status === 'SCHEDULED';

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin">
          ← Admin dashboard
        </Link>

        <Link href="/">
          Amazing Chance
        </Link>
      </header>

      <h1>{draw.publicId}</h1>

      <p className={styles.muted}>
        {draw.type} · {draw.status}
      </p>

      <section className={styles.panel}>
        <dl className={styles.meta}>
          <div>
            <dt>UUID</dt>
            <dd>{draw.id}</dd>
          </div>

          <div>
            <dt>Status</dt>
            <dd>{draw.status}</dd>
          </div>

          <div>
            <dt>Currency</dt>
            <dd>{draw.currency}</dd>
          </div>

          <div>
            <dt>Winner count</dt>
            <dd>{draw.winnerCount}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.panel}>
        <h2>
          {editable
            ? 'Edit scheduled draw'
            : 'Draw configuration'}
        </h2>

        {!editable ? (
          <p className={styles.muted}>
            Editing is locked because only SCHEDULED draws may be changed.
          </p>
        ) : null}

        <form className={styles.form} onSubmit={save}>
          <label>
            Scheduled draw
            <input
              type="datetime-local"
              value={scheduledDrawAt}
              onChange={(event) =>
                setScheduledDrawAt(event.target.value)
              }
              disabled={!editable}
              required
            />
          </label>

          <label>
            Sales open
            <input
              type="datetime-local"
              value={salesOpenAt}
              onChange={(event) =>
                setSalesOpenAt(event.target.value)
              }
              disabled={!editable}
            />
          </label>

          <label>
            Sales close
            <input
              type="datetime-local"
              value={salesCloseAt}
              onChange={(event) =>
                setSalesCloseAt(event.target.value)
              }
              disabled={!editable}
            />
          </label>

          <label>
            Currency
            <input
              value={currency}
              maxLength={3}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
              disabled={!editable}
              required
            />
          </label>

          <label>
            Ticket price, minor units
            <input
              value={ticketPriceMinor}
              onChange={(event) =>
                setTicketPriceMinor(event.target.value)
              }
              disabled={!editable}
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
              onChange={(event) =>
                setWinnerCount(event.target.value)
              }
              disabled={!editable}
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
              onChange={(event) =>
                setParticipationYear(event.target.value)
              }
              disabled={!editable}
            />
          </label>

          {notice ? (
            <p className={styles.full}>
              {notice}
            </p>
          ) : null}

          {error ? (
            <p
              className={`${styles.error} ${styles.full}`}
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            className={`${styles.button} ${styles.full}`}
            disabled={saving || !editable}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </section>
    </main>
  );
}
