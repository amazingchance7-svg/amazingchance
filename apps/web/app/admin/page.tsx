'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import styles from './admin.module.css';

type SessionUser = {
  id: string;
  email: string;
  status: string;
};

type Draw = {
  id: string;
  publicId: string;
  type: 'WEEKLY' | 'ANNUAL';
  status: string;
  sequenceNumber: number;
  participationYear: number | null;
  salesOpenAt: string | null;
  salesCloseAt: string | null;
  scheduledDrawAt: string;
  completedAt: string | null;
  publishedAt: string | null;
  currency: string;
  ticketPriceMinor: string;
  winnerCount: number;
};

type DrawsResponse = {
  items: Draw[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type DrawAction =
  | 'open-sales'
  | 'close-sales'
  | 'build-snapshot'
  | 'finalize-snapshot'
  | 'request-randomness'
  | 'select-winners'
  | 'cancel'
  | 'publish';

type ActionDefinition = {
  action: DrawAction;
  label: string;
  danger?: boolean;
};

const ACTIONS_BY_STATUS: Record<string, ActionDefinition[]> = {
  SCHEDULED: [
    { action: 'open-sales', label: 'Open sales' },
    { action: 'cancel', label: 'Cancel draw', danger: true },
  ],
  SALES_OPEN: [
    { action: 'close-sales', label: 'Close sales' },
    { action: 'cancel', label: 'Cancel draw', danger: true },
  ],
  SALES_CLOSED: [
    { action: 'build-snapshot', label: 'Build snapshot' },
  ],
  SNAPSHOT_BUILDING: [
    { action: 'finalize-snapshot', label: 'Finalize snapshot' },
  ],
  SNAPSHOT_FINALIZED: [
    { action: 'request-randomness', label: 'Request randomness' },
  ],
  RANDOMNESS_VERIFIED: [
    { action: 'select-winners', label: 'Select winners' },
  ],
  COMPLETED: [
    { action: 'publish', label: 'Publish result' },
  ],
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

function formatDate(value: string | null): string {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatMinor(amountMinor: string, currency: string): string {
  const amount = Number(amountMinor);
  if (!Number.isFinite(amount)) return `${amountMinor} ${currency}`;

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount / 100);
  } catch {
    return `${amountMinor} ${currency}`;
  }
}

export default function AdminPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadAdmin() {
    setLoading(true);
    setError(null);

    try {
      const sessionResponse = await fetch('/api/session/me', {
        cache: 'no-store',
      });

      if (sessionResponse.status === 401) {
        setUser(null);
        setDraws([]);
        return;
      }

      if (!sessionResponse.ok) {
        throw new Error(await readMessage(sessionResponse));
      }

      const sessionUser = (await sessionResponse.json()) as SessionUser;

      const drawsResponse = await fetch('/api/admin/draws', {
        cache: 'no-store',
      });

      if (!drawsResponse.ok) {
        throw new Error(await readMessage(drawsResponse));
      }

      const drawData = (await drawsResponse.json()) as DrawsResponse;

      setUser(sessionUser);
      setDraws(drawData.items);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load admin dashboard.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAdmin();
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      setPassword('');
      await loadAdmin();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to sign in.',
      );
    } finally {
      setSigningIn(false);
    }
  }

  async function logout() {
    await fetch('/api/session/logout', { method: 'POST' });
    setUser(null);
    setDraws([]);
    setNotice(null);
    setError(null);
  }

  async function runAction(draw: Draw, definition: ActionDefinition) {
    if (
      definition.danger &&
      !window.confirm(
        `Confirm ${definition.label.toLowerCase()} for ${draw.publicId}?`,
      )
    ) {
      return;
    }

    const key = `${draw.id}:${definition.action}`;
    setActionKey(key);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/admin/draws/${encodeURIComponent(draw.id)}/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: definition.action }),
        },
      );

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            `Permission denied for "${definition.label}". The backend permission guard rejected this operation.`,
          );
        }

        throw new Error(await readMessage(response));
      }

      setNotice(`${definition.label} completed for ${draw.publicId}.`);
      await loadAdmin();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Admin operation failed.',
      );
    } finally {
      setActionKey(null);
    }
  }

  const activeCount = useMemo(
    () =>
      draws.filter(
        (draw) => !['PUBLISHED', 'CANCELLED', 'FAILED'].includes(draw.status),
      ).length,
    [draws],
  );

  const openSalesCount = useMemo(
    () => draws.filter((draw) => draw.status === 'SALES_OPEN').length,
    [draws],
  );

  const publishedCount = useMemo(
    () => draws.filter((draw) => draw.status === 'PUBLISHED').length,
    [draws],
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Amazing Chance
        </Link>

        <nav className={styles.nav}>
          <Link href="/admin/operations">Backoffice</Link>
          <Link href="/account">Account</Link>
          <Link href="/verify">Verification</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Operations</p>
        <h1>Admin dashboard</h1>
        <p>
          Draw lifecycle actions are always authorized by the backend permission
          guard. This interface never bypasses server-side permissions.
        </p>
      </section>

      {loading ? (
        <section className={styles.panel}>Loading admin dashboard...</section>
      ) : !user ? (
        <form className={styles.panel} onSubmit={login}>
          <h2>Admin sign in</h2>
          <p className={styles.muted}>
            Sign in with an account that has the required draw permissions.
          </p>

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          <button className={styles.primaryButton} disabled={signingIn}>
            {signingIn ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      ) : (
        <>
          <section className={styles.sessionBar}>
            <div>
              Signed in as <strong>{user.email}</strong>
            </div>

            <button type="button" onClick={() => void logout()}>
              Sign out
            </button>
          </section>

          <section className={styles.metrics}>
            <article>
              <span>Total draws</span>
              <strong>{draws.length}</strong>
            </article>
            <article>
              <span>Active</span>
              <strong>{activeCount}</strong>
            </article>
            <article>
              <span>Sales open</span>
              <strong>{openSalesCount}</strong>
            </article>
            <article>
              <span>Published</span>
              <strong>{publishedCount}</strong>
            </article>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Draw operations</p>
                <h2>Lottery draws</h2>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <Link href="/admin/draws/new">Create draw</Link>
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={() => void loadAdmin()}
                >
                  Refresh
                </button>
              </div>
            </div>

            {draws.length === 0 ? (
              <p className={styles.muted}>No lottery draws found.</p>
            ) : (
              <div className={styles.drawList}>
                {draws.map((draw) => {
                  const actions = ACTIONS_BY_STATUS[draw.status] ?? [];

                  return (
                    <article key={draw.id} className={styles.drawCard}>
                      <div className={styles.drawHeader}>
                        <div>
                          <span className={styles.drawType}>{draw.type}</span>
                          <h3>{draw.publicId}</h3>
                        </div>

                        <span className={styles.statusBadge}>{draw.status}</span>
                      </div>

                      <dl className={styles.drawMeta}>
                        <div>
                          <dt>Draw date</dt>
                          <dd>{formatDate(draw.scheduledDrawAt)}</dd>
                        </div>
                        <div>
                          <dt>Sales close</dt>
                          <dd>{formatDate(draw.salesCloseAt)}</dd>
                        </div>
                        <div>
                          <dt>Ticket price</dt>
                          <dd>
                            {formatMinor(
                              draw.ticketPriceMinor,
                              draw.currency,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Winners</dt>
                          <dd>{draw.winnerCount}</dd>
                        </div>
                      </dl>

                      <div className={styles.actions}>
                        <Link href={`/admin/draws/${encodeURIComponent(draw.id)}`}>
                          Manage draw
                        </Link>
                        {actions.length > 0 ? (
                          actions.map((definition) => {
                            const key = `${draw.id}:${definition.action}`;
                            const busy = actionKey === key;

                            return (
                              <button
                                key={definition.action}
                                type="button"
                                className={
                                  definition.danger
                                    ? styles.dangerButton
                                    : styles.actionButton
                                }
                                disabled={actionKey !== null}
                                onClick={() =>
                                  void runAction(draw, definition)
                                }
                              >
                                {busy ? 'Working...' : definition.label}
                              </button>
                            );
                          })
                        ) : (
                          <span className={styles.muted}>
                            No manual action for this state.
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {notice ? (
        <section className={styles.notice} role="status">
          {notice}
        </section>
      ) : null}

      {error ? (
        <section className={styles.error} role="alert">
          {error}
        </section>
      ) : null}
    </main>
  );
}
