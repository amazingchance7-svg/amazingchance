'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import styles from './account.module.css';

type SessionUser = {
  id: string;
  email: string;
  status: string;
};

type Purchase = {
  id: string;
  publicId: string;
  drawId: string;
  status: string;
  requestedTicketCount: number;
  ticketPriceMinor: string;
  totalAmountMinor: string;
  currency: string;
  createdAt: string;
  expiresAt: string | null;
  paymentConfirmedAt: string | null;
  completedAt: string | null;
};

type Ticket = {
  id: string;
  publicId: string;
  numberInDraw: string;
  status: string;
  issuedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
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
    completedAt: string | null;
    publishedAt: string | null;
    currency: string;
  };
  verification: {
    includedInSnapshot: boolean;
    snapshotPosition: string | null;
    publicVerificationAvailable: boolean;
  };
};

type TicketsResponse = {
  tickets: Ticket[];
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

function formatMinor(amountMinor: string, currency: string): string {
  const numeric = Number(amountMinor);

  if (!Number.isFinite(numeric)) {
    return `${amountMinor} ${currency}`;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(numeric / 100);
  } catch {
    return `${amountMinor} ${currency}`;
  }
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

export default function AccountPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAccount() {
    setLoading(true);
    setError(null);

    try {
      const sessionResponse = await fetch('/api/session/me', {
        cache: 'no-store',
      });

      if (sessionResponse.status === 401) {
        setUser(null);
        setPurchases([]);
        setTickets([]);
        return;
      }

      if (!sessionResponse.ok) {
        throw new Error(await readMessage(sessionResponse));
      }

      const sessionUser = (await sessionResponse.json()) as SessionUser;

      const [purchasesResponse, ticketsResponse] = await Promise.all([
        fetch('/api/account/purchases', { cache: 'no-store' }),
        fetch('/api/account/tickets', { cache: 'no-store' }),
      ]);

      if (!purchasesResponse.ok) {
        throw new Error(await readMessage(purchasesResponse));
      }

      if (!ticketsResponse.ok) {
        throw new Error(await readMessage(ticketsResponse));
      }

      const purchaseData = (await purchasesResponse.json()) as Purchase[];
      const ticketData = (await ticketsResponse.json()) as TicketsResponse;

      setUser(sessionUser);
      setPurchases(purchaseData);
      setTickets(ticketData.tickets);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load account.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAccount();
    }, 0);

    return () => {
      clearTimeout(timer);
    };
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
      await loadAccount();
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
    await fetch('/api/session/logout', {
      method: 'POST',
    });

    setUser(null);
    setPurchases([]);
    setTickets([]);
  }

  const activeTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'ACTIVE').length,
    [tickets],
  );

  const completedPurchases = useMemo(
    () => purchases.filter((purchase) => purchase.status === 'COMPLETED').length,
    [purchases],
  );

  const verifiableTickets = useMemo(
    () =>
      tickets.filter(
        (ticket) => ticket.verification.publicVerificationAvailable,
      ).length,
    [tickets],
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Amazing Chance
        </Link>

        <nav className={styles.nav}>
          <Link href="/checkout">Buy tickets</Link>
          <Link href="/verify">Verification</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Account</p>
        <h1>Your purchases and tickets.</h1>
        <p>
          Review payment history, issued ticket numbers and public verification
          readiness from one place.
        </p>
      </section>

      {loading ? (
        <section className={styles.panel}>Loading account...</section>
      ) : !user ? (
        <form className={styles.panel} onSubmit={login}>
          <h2>Sign in</h2>

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
              <span>Purchases</span>
              <strong>{purchases.length}</strong>
            </article>
            <article>
              <span>Completed</span>
              <strong>{completedPurchases}</strong>
            </article>
            <article>
              <span>Active tickets</span>
              <strong>{activeTickets}</strong>
            </article>
            <article>
              <span>Verifiable</span>
              <strong>{verifiableTickets}</strong>
            </article>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>My tickets</p>
                <h2>Issued tickets</h2>
              </div>
              <span className={styles.counter}>{tickets.length}</span>
            </div>

            {tickets.length === 0 ? (
              <p className={styles.muted}>No issued tickets yet.</p>
            ) : (
              <div className={styles.ticketGrid}>
                {tickets.map((ticket) => (
                  <article key={ticket.id} className={styles.ticketCard}>
                    <div className={styles.ticketTop}>
                      <strong>#{ticket.numberInDraw}</strong>
                      <span>{ticket.status}</span>
                    </div>

                    <dl>
                      <div>
                        <dt>Ticket</dt>
                        <dd>{ticket.publicId}</dd>
                      </div>
                      <div>
                        <dt>Draw</dt>
                        <dd>{ticket.draw.publicId}</dd>
                      </div>
                      <div>
                        <dt>Draw date</dt>
                        <dd>{formatDate(ticket.draw.scheduledDrawAt)}</dd>
                      </div>
                      <div>
                        <dt>Verification</dt>
                        <dd>
                          {ticket.verification.publicVerificationAvailable
                            ? 'Public verification available'
                            : ticket.verification.includedInSnapshot
                              ? 'Included in snapshot'
                              : 'Pending snapshot'}
                        </dd>
                      </div>
                    </dl>

                    {ticket.verification.publicVerificationAvailable ? (
                      <Link
                        href={`/verify?ticket=${encodeURIComponent(
                          ticket.publicId,
                        )}`}
                      >
                        Verify ticket
                      </Link>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Purchase history</p>
                <h2>Purchases</h2>
              </div>
              <span className={styles.counter}>{purchases.length}</span>
            </div>

            {purchases.length === 0 ? (
              <p className={styles.muted}>No purchases yet.</p>
            ) : (
              <div className={styles.purchaseList}>
                {purchases.map((purchase) => (
                  <article key={purchase.id} className={styles.purchaseRow}>
                    <div>
                      <strong>{purchase.publicId}</strong>
                      <span>{formatDate(purchase.createdAt)}</span>
                    </div>

                    <div>
                      <span>{purchase.requestedTicketCount} tickets</span>
                      <strong>
                        {formatMinor(
                          purchase.totalAmountMinor,
                          purchase.currency,
                        )}
                      </strong>
                    </div>

                    <span className={styles.statusBadge}>{purchase.status}</span>

                    {purchase.status === 'COMPLETED' ? (
                      <Link
                        href={`/checkout/result?purchaseId=${encodeURIComponent(
                          purchase.id,
                        )}`}
                      >
                        View tickets
                      </Link>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {error ? (
        <section className={styles.error} role="alert">
          {error}
        </section>
      ) : null}
    </main>
  );
}
