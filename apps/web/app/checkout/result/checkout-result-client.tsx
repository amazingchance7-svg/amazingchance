'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from '../checkout.module.css';

type PurchasePayload = {
  purchase: {
    id: string;
    publicId: string;
    status: string;
    requestedTicketCount: number;
    totalAmountMinor: string;
    currency: string;
    paymentConfirmedAt: string | null;
    completedAt: string | null;
    expiresAt: string | null;
  };
};

const TERMINAL = new Set([
  'COMPLETED',
  'PAYMENT_FAILED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
  'MANUAL_REVIEW',
]);

async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (typeof body.message === 'string') return body.message;
  } catch {
    // Response was not JSON.
  }
  return `Request failed with status ${response.status}`;
}

function copyFor(status: string) {
  switch (status) {
    case 'COMPLETED':
      return {
        title: 'Payment verified. Tickets issued.',
        body:
          'The signed Stripe webhook was verified by the server and the purchase completed successfully.',
        tone: 'success' as const,
      };
    case 'PAYMENT_FAILED':
      return {
        title: 'Payment failed.',
        body: 'Stripe reported that the payment failed. No tickets were issued.',
        tone: 'error' as const,
      };
    case 'EXPIRED':
      return {
        title: 'Purchase expired.',
        body: 'The purchase expired before payment confirmation completed.',
        tone: 'error' as const,
      };
    case 'CANCELLED':
      return {
        title: 'Purchase cancelled.',
        body: 'This purchase was cancelled and no tickets were issued.',
        tone: 'error' as const,
      };
    case 'REFUNDED':
      return {
        title: 'Payment refunded.',
        body: 'The payment was refunded.',
        tone: 'error' as const,
      };
    case 'MANUAL_REVIEW':
      return {
        title: 'Payment requires review.',
        body: 'The purchase has been held for manual review.',
        tone: 'error' as const,
      };
    default:
      return {
        title: 'Payment is being verified.',
        body:
          'Amazing Chance is waiting for the signed Stripe webhook before issuing tickets.',
        tone: 'processing' as const,
      };
  }
}

export default function CheckoutResultClient({
  purchaseId,
}: {
  purchaseId: string;
}) {
  const [payload, setPayload] = useState<PurchasePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    async function poll() {
      try {
        const response = await fetch(
          `/api/checkout/status/${encodeURIComponent(purchaseId)}`,
          { method: 'GET', cache: 'no-store' },
        );

        if (!response.ok) throw new Error(await readMessage(response));

        const result = (await response.json()) as PurchasePayload;
        if (cancelled) return;

        setPayload(result);
        setError(null);

        if (TERMINAL.has(result.purchase.status)) return;

        if (Date.now() - startedAt >= 60_000) {
          setTimedOut(true);
          return;
        }

        timer = setTimeout(() => void poll(), 2_000);
      } catch (requestError) {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load purchase status.',
        );
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [purchaseId]);

  const copy = useMemo(
    () => copyFor(payload?.purchase.status ?? 'PAYMENT_PENDING'),
    [payload],
  );

  const toneClass =
    copy.tone === 'success'
      ? styles.resultSuccess
      : copy.tone === 'error'
        ? styles.resultError
        : styles.resultProcessing;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>Amazing Chance</Link>
        <Link href="/verify" className={styles.secondaryLink}>
          Verification portal
        </Link>
      </header>

      <section className={`${styles.card} ${toneClass}`}>
        <p className={styles.eyebrow}>Secure payment status</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>

        {payload ? (
          <div className={styles.summary}>
            <div>
              <span>Purchase</span>
              <strong>{payload.purchase.publicId}</strong>
            </div>
            <div>
              <span>Tickets</span>
              <strong>{payload.purchase.requestedTicketCount}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{payload.purchase.status}</strong>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className={styles.error} role="alert">{error}</p>
        ) : null}

        {timedOut &&
        payload &&
        !TERMINAL.has(payload.purchase.status) ? (
          <p className={styles.securityNote}>
            Verification is taking longer than expected. The purchase has not
            been marked successful. Refresh later to request the authoritative
            server status again.
          </p>
        ) : null}

        {payload?.purchase.status === 'COMPLETED' ? (
          <p className={styles.securityNote}>
            Tickets were issued only after server-side payment confirmation.
          </p>
        ) : null}

        <div className={styles.resultActions}>
          <Link href="/checkout" className={styles.actionLink}>
            Return to checkout
          </Link>
          <Link href="/verify" className={styles.actionLink}>
            Verification portal
          </Link>
        </div>
      </section>
    </main>
  );
}
