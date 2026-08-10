'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import styles from './operations.module.css';

type SessionUser = {
  id: string;
  email: string;
  status: string;
};

type Overview = {
  users: {
    total: number;
    active: number;
    pendingVerification: number;
    suspended: number;
  };
  purchases: {
    total: number;
    completed: number;
    inProgress: number;
    paymentFailed: number;
    manualReview: number;
    refunded: number;
  };
  tickets: {
    total: number;
    active: number;
    voidedByRefund: number;
  };
  finance: {
    completedPurchaseVolume: Array<{
      currency: string;
      amountMinor: string;
      purchaseCount: number;
    }>;
    successfulPaymentVolume: Array<{
      currency: string;
      amountMinor: string;
      paymentCount: number;
    }>;
  };
};

type UserRow = {
  id: string;
  email: string;
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  purchaseCount: number;
  ticketCount: number;
  roles: string[];
};

type PurchaseRow = {
  id: string;
  publicId: string;
  status: string;
  requestedTicketCount: number;
  ticketPriceMinor: string;
  totalAmountMinor: string;
  currency: string;
  expiresAt: string | null;
  paymentConfirmedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    status: string;
  };
  draw: {
    id: string;
    publicId: string;
    type: string;
    status: string;
    scheduledDrawAt: string;
  };
  ticketCount: number;
  paymentCount: number;
};

type TicketRow = {
  id: string;
  publicId: string;
  numberInDraw: string;
  status: string;
  issuedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  user: {
    id: string;
    email: string;
  };
  purchase: {
    id: string;
    publicId: string;
    status: string;
  };
  draw: {
    id: string;
    publicId: string;
    type: string;
    status: string;
    scheduledDrawAt: string;
  };
};

type ListResponse<T> = {
  items: T[];
  limit: number;
};

async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (typeof body.message === 'string') {
      return body.message;
    }
  } catch {
    // Response was not JSON.
  }

  return `Request failed with status ${response.status}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatMinor(amountMinor: string, currency: string): string {
  const amount = Number(amountMinor);

  if (!Number.isFinite(amount)) {
    return `${amountMinor} ${currency}`;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount / 100);
  } catch {
    return `${amountMinor} ${currency}`;
  }
}

export default function OperationsBackofficePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [controlKey, setControlKey] = useState<string | null>(null);
  async function loadBackoffice() {
    setLoading(true);
    setError(null);

    try {
      const sessionResponse = await fetch('/api/session/me', {
        cache: 'no-store',
      });

      if (sessionResponse.status === 401) {
        setUser(null);
        setOverview(null);
        setUsers([]);
        setPurchases([]);
        setTickets([]);
        return;
      }

      if (!sessionResponse.ok) {
        throw new Error(await readMessage(sessionResponse));
      }

      const sessionUser = (await sessionResponse.json()) as SessionUser;

      const [overviewResponse, usersResponse, purchasesResponse, ticketsResponse] =
        await Promise.all([
          fetch('/api/admin/operations/overview', { cache: 'no-store' }),
          fetch('/api/admin/operations/users', { cache: 'no-store' }),
          fetch('/api/admin/operations/purchases', { cache: 'no-store' }),
          fetch('/api/admin/operations/tickets', { cache: 'no-store' }),
        ]);

      const responses = [
        overviewResponse,
        usersResponse,
        purchasesResponse,
        ticketsResponse,
      ];

      const denied = responses.find((response) => response.status === 403);

      if (denied) {
        throw new Error(
          'Permission denied. PLATFORM_ADMIN backoffice read permissions are required.',
        );
      }

      const failed = responses.find((response) => !response.ok);

      if (failed) {
        throw new Error(await readMessage(failed));
      }

      const [
        overviewData,
        usersData,
        purchasesData,
        ticketsData,
      ] = await Promise.all([
        overviewResponse.json() as Promise<Overview>,
        usersResponse.json() as Promise<ListResponse<UserRow>>,
        purchasesResponse.json() as Promise<ListResponse<PurchaseRow>>,
        ticketsResponse.json() as Promise<ListResponse<TicketRow>>,
      ]);

      setUser(sessionUser);
      setOverview(overviewData);
      setUsers(usersData.items);
      setPurchases(purchasesData.items);
      setTickets(ticketsData.items);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load operations backoffice.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadBackoffice();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setError(null);

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
      await loadBackoffice();
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
    setOverview(null);
    setUsers([]);
    setPurchases([]);
    setTickets([]);
    setError(null);
  }

  async function runPurchaseControl(
    purchase: PurchaseRow,
    action: 'manual-review' | 'cancel-manual-review' | 'refund',
  ) {

    const label =
      action === 'manual-review'
        ? 'Move to manual review'
        : action === 'cancel-manual-review'
          ? 'Cancel unpaid purchase'
          : 'Request full refund';

    if (
      action === 'cancel-manual-review' &&
      !window.confirm(
        `Confirm cancellation of ${purchase.publicId}? This control is only for unpaid MANUAL_REVIEW purchases.`,
      )
    ) {
      return;
    }

    if (
      action === 'refund' &&
      !window.confirm(
        `Request a full Stripe refund for ${purchase.publicId}? The backend will only allow an eligible COMPLETED purchase before snapshot creation.`,
      )
    ) {
      return;
    }
    const reason = window.prompt(
      `${label} вЂ” enter an operator reason (minimum 3 characters):`,
    );

    if (reason === null) {
      return;
    }

    const normalizedReason = reason.trim();

    if (normalizedReason.length < 3) {
      setError('Operator reason must contain at least 3 characters.');
      return;
    }

    const key = `${purchase.id}:${action}`;

    setControlKey(key);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/admin/operations/purchases/${encodeURIComponent(
          purchase.id,
        )}/action`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            reason: normalizedReason,
          }),
        },
      );

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            `Permission denied for "${label}". PLATFORM_ADMIN permission for this purchase action is required.`,
          );
        }

        throw new Error(await readMessage(response));
      }

      await loadBackoffice();
      setNotice(`${label} completed for ${purchase.publicId}.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Purchase control failed.',
      );
    } finally {
      setControlKey(null);
    }
  }
  const reviewAttention = useMemo(
    () =>
      (overview?.purchases.manualReview ?? 0) +
      (overview?.purchases.paymentFailed ?? 0),
    [overview],
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Amazing Chance
        </Link>

        <nav className={styles.nav}>
          <Link href="/admin">Draw operations</Link>
          <Link href="/account">Account</Link>
          <Link href="/verify">Verification</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Platform administration</p>
        <h1>Operations backoffice</h1>
        <p className={styles.muted}>
          Operational view of users, purchases, issued tickets and
          aggregate payment activity. Cross-user access remains protected by
          backend PLATFORM_ADMIN permissions.
        </p>
      </section>

      {loading ? (
        <section className={styles.panel}>Loading backoffice...</section>
      ) : !user ? (
        <section className={styles.panel}>
          <form className={styles.loginForm} onSubmit={login}>
            <h2>Platform admin sign in</h2>

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            <button className={styles.button} disabled={signingIn}>
              {signingIn ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className={styles.sessionBar}>
            <div>
              Signed in as <strong>{user.email}</strong>
            </div>

            <div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void loadBackoffice()}
              >
                Refresh
              </button>{' '}
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void logout()}
              >
                Sign out
              </button>
            </div>
          </section>

          {overview ? (
            <>
              <section className={styles.metrics}>
                <article className={styles.metric}>
                  <span>Users</span>
                  <strong>{overview.users.total}</strong>
                  <small>{overview.users.active} active</small>
                </article>

                <article className={styles.metric}>
                  <span>Purchases</span>
                  <strong>{overview.purchases.total}</strong>
                  <small>{overview.purchases.completed} completed</small>
                </article>

                <article className={styles.metric}>
                  <span>Tickets</span>
                  <strong>{overview.tickets.total}</strong>
                  <small>{overview.tickets.active} active</small>
                </article>

                <article className={styles.metric}>
                  <span>Needs attention</span>
                  <strong>{reviewAttention}</strong>
                  <small>
                    review {overview.purchases.manualReview} · failed{' '}
                    {overview.purchases.paymentFailed}
                  </small>
                </article>
              </section>

              <section className={styles.panel}>
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.eyebrow}>Financial overview</p>
                    <h2>Volume by currency</h2>
                  </div>
                </div>

                <div className={styles.financeGrid}>
                  <article className={styles.financeCard}>
                    <strong>Completed purchases</strong>

                    <div className={styles.financeRows}>
                      {overview.finance.completedPurchaseVolume.length > 0 ? (
                        overview.finance.completedPurchaseVolume.map((row) => (
                          <div key={row.currency} className={styles.financeRow}>
                            <span>
                              {formatMinor(row.amountMinor, row.currency)}
                            </span>
                            <span className={styles.muted}>
                              {row.purchaseCount} purchases
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className={styles.muted}>No completed volume.</span>
                      )}
                    </div>
                  </article>

                  <article className={styles.financeCard}>
                    <strong>Successful payments</strong>

                    <div className={styles.financeRows}>
                      {overview.finance.successfulPaymentVolume.length > 0 ? (
                        overview.finance.successfulPaymentVolume.map((row) => (
                          <div key={row.currency} className={styles.financeRow}>
                            <span>
                              {formatMinor(row.amountMinor, row.currency)}
                            </span>
                            <span className={styles.muted}>
                              {row.paymentCount} payments
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className={styles.muted}>No successful volume.</span>
                      )}
                    </div>
                  </article>
                </div>
              </section>
            </>
          ) : null}

          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Accounts</p>
                <h2>Recent users</h2>
              </div>
              <span className={styles.muted}>{users.length} loaded</span>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Status</th>
                    <th>Roles</th>
                    <th>Purchases</th>
                    <th>Tickets</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div>{row.email}</div>
                        <div className={styles.code}>{row.id}</div>
                      </td>
                      <td>
                        <span className={styles.status}>{row.status}</span>
                      </td>
                      <td>{row.roles.join(', ') || '—'}</td>
                      <td>{row.purchaseCount}</td>
                      <td>{row.ticketCount}</td>
                      <td>{formatDate(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Commerce</p>
                <h2>Recent purchases</h2>
              </div>
              <span className={styles.muted}>{purchases.length} loaded</span>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Purchase</th>
                    <th>User</th>
                    <th>Draw</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Tickets</th>
                    <th>Created</th>
                  <th>Control</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div>{row.publicId}</div>
                        <div className={styles.code}>{row.id}</div>
                      </td>
                      <td>{row.user.email}</td>
                      <td>
                        <div>{row.draw.publicId}</div>
                        <span className={styles.muted}>{row.draw.type}</span>
                      </td>
                      <td>
                        <span className={styles.status}>{row.status}</span>
                      </td>
                      <td>{formatMinor(row.totalAmountMinor, row.currency)}</td>
                      <td>
                        {row.ticketCount} / requested {row.requestedTicketCount}
                      </td>
                      <td>{formatDate(row.createdAt)}</td>
                      <td>
                        <div className={styles.purchaseControls}>
                          {row.status === 'PAYMENT_PENDING' ||
                          row.status === 'PAYMENT_FAILED' ? (
                            <button
                              type="button"
                              className={styles.controlButton}
                              disabled={controlKey !== null}
                              onClick={() =>
                                void runPurchaseControl(
                                  row,
                                  'manual-review',
                                )
                              }
                            >
                              {controlKey === `${row.id}:manual-review`
                                ? 'Working...'
                                : 'Manual review'}
                            </button>
                          ) : null}

                          {row.status === 'MANUAL_REVIEW' ? (
                            <button
                              type="button"
                              className={styles.dangerButton}
                              disabled={controlKey !== null}
                              onClick={() =>
                                void runPurchaseControl(
                                  row,
                                  'cancel-manual-review',
                                )
                              }
                            >
                              {controlKey ===
                              `${row.id}:cancel-manual-review`
                                ? 'Working...'
                                : 'Cancel unpaid'}
                            </button>
                          ) : null}
                          {row.status === 'COMPLETED' ? (
                            <button
                              type="button"
                              className={styles.dangerButton}
                              disabled={controlKey !== null}
                              onClick={() =>
                                void runPurchaseControl(row, 'refund')
                              }
                            >
                              {controlKey === `${row.id}:refund`
                                ? 'Requesting...'
                                : 'Refund'}
                            </button>
                          ) : null}

                          {row.status === 'REFUND_PENDING' ? (
                            <span className={styles.muted}>
                              Awaiting Stripe
                            </span>
                          ) : null}

                          {row.status === 'REFUNDED' ? (
                            <span className={styles.muted}>
                              Refunded
                            </span>
                          ) : null}

                          {![
                            'PAYMENT_PENDING',
                            'PAYMENT_FAILED',
                            'MANUAL_REVIEW',
                            'COMPLETED',
                            'REFUND_PENDING',
                            'REFUNDED',
                          ].includes(row.status) ? (
                            <span className={styles.muted}>вЂ”</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Issuance</p>
                <h2>Recent tickets</h2>
              </div>
              <span className={styles.muted}>{tickets.length} loaded</span>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Number</th>
                    <th>User</th>
                    <th>Draw</th>
                    <th>Purchase</th>
                    <th>Status</th>
                    <th>Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div>{row.publicId}</div>
                        <div className={styles.code}>{row.id}</div>
                      </td>
                      <td>#{row.numberInDraw}</td>
                      <td>{row.user.email}</td>
                      <td>{row.draw.publicId}</td>
                      <td>{row.purchase.publicId}</td>
                      <td>
                        <span className={styles.status}>{row.status}</span>
                      </td>
                      <td>{formatDate(row.issuedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
