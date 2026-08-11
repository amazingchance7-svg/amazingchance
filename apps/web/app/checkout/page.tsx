'use client';

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import {
  loadStripe,
} from '@stripe/stripe-js';
import Link from 'next/link';
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import styles from './checkout.module.css';

type SessionUser = {
  id: string;
  email: string;
  status: string;
};


type SalesAvailability = {
  available: boolean;
  reason:
    | 'AVAILABLE'
    | 'NO_WEEKLY_DRAW'
    | 'SALES_NOT_STARTED'
    | 'SALES_CLOSED';
  drawId: string | null;
  publicId: string | null;
  scheduledDrawAt: string | null;
  effectiveCutoffAt: string | null;
  ticketPriceMinor: string | null;
  currency: string | null;
};

type CheckoutPayload = {
  purchase: {
    id: string;
    publicId: string;
    status: string;
    requestedTicketCount: number;
    totalAmountMinor: string;
    currency: string;
    expiresAt: string | null;
  };
  payment: {
    paymentIntentId: string;
    clientSecret: string;
    amountMinor: string;
    currency: string;
    status: string;
  };
};

const publishableKey =
  process.env
    .NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
  '';

const stripePromise =
  publishableKey
    ? loadStripe(
        publishableKey,
      )
    : null;

async function readMessage(
  response: Response,
): Promise<string> {
  try {
    const body =
      (await response.json()) as {
        message?: string;
      };

    if (
      typeof body.message ===
      'string'
    ) {
      return body.message;
    }
  } catch {
    // Response was not JSON.
  }

  return `Request failed with status ${response.status}`;
}

function PaymentForm({
  checkout,
}: {
  checkout: CheckoutPayload;
}) {
  const stripe =
    useStripe();
  const elements =
    useElements();

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !stripe ||
      !elements
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const result =
      await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url:
            `${window.location.origin}/checkout/result?purchaseId=${encodeURIComponent(
              checkout.purchase.id,
            )}`,
        },
      });

    if (result.error) {
      setError(
        result.error.message ??
          'Payment confirmation failed.',
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      className={
        styles.paymentForm
      }
      onSubmit={submit}
    >
      <PaymentElement />

      {error ? (
        <p
          className={
            styles.error
          }
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        className={
          styles.primaryButton
        }
        type="submit"
        disabled={
          submitting ||
          !stripe ||
          !elements
        }
      >
        {submitting
          ? 'Confirming payment...'
          : `Pay ${checkout.payment.amountMinor} ${checkout.payment.currency} (minor units)`}
      </button>

      <p
        className={
          styles.securityNote
        }
      >
        Card details are handled
        directly by Stripe. Amazing
        Chance never receives your
        full card number.
      </p>
    </form>
  );
}

export default function CheckoutPage() {
  const [
    user,
    setUser,
  ] =
    useState<SessionUser | null>(
      null,
    );

  const [
    checkingSession,
    setCheckingSession,
  ] = useState(true);

  const [
    email,
    setEmail,
  ] = useState('');

  const [
    password,
    setPassword,
  ] = useState('');


  const [
    availability,
    setAvailability,
  ] =
    useState<SalesAvailability | null>(
      null,
    );

  const [
    checkingAvailability,
    setCheckingAvailability,
  ] = useState(true);

  const [
    drawId,
    setDrawId,
  ] = useState('');

  const [
    ticketCount,
    setTicketCount,
  ] = useState(1);

  const [
    checkout,
    setCheckout,
  ] =
    useState<CheckoutPayload | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  useEffect(() => {
    async function loadSession() {
      try {
        const response =
          await fetch(
            '/api/session/me',
            {
              cache:
                'no-store',
            },
          );

        if (response.ok) {
          setUser(
            (await response.json()) as SessionUser,
          );
        }
      } finally {
        setCheckingSession(
          false,
        );
      }
    }

    void loadSession();
  }, []);


  useEffect(() => {
    let active = true;

    async function loadAvailability() {
      try {
        const response =
          await fetch(
            '/api/sales-availability',
            {
              cache:
                'no-store',
            },
          );

        if (!response.ok) {
          throw new Error(
            await readMessage(
              response,
            ),
          );
        }

        const result =
          (await response.json()) as SalesAvailability;

        if (!active) {
          return;
        }

        setAvailability(
          result,
        );
        setDrawId(
          result.available &&
          result.drawId
            ? result.drawId
            : '',
        );
      } catch (
        requestError
      ) {
        if (active) {
          setAvailability(
            null,
          );
          setDrawId('');
          setError(
            requestError instanceof
              Error
              ? requestError.message
              : 'Unable to load ticket sales availability.',
          );
        }
      } finally {
        if (active) {
          setCheckingAvailability(
            false,
          );
        }
      }
    }

    void loadAvailability();

    const interval =
      window.setInterval(
        () => {
          void loadAvailability();
        },
        15_000,
      );

    return () => {
      active = false;
      window.clearInterval(
        interval,
      );
    };
  }, []);

  const appearance =
    useMemo(
      () => ({
        theme:
          'night' as const,
        variables: {
          borderRadius:
            '12px',
        },
      }),
      [],
    );

  async function login(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response =
        await fetch(
          '/api/session/login',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                email,
                password,
              }),
          },
        );

      if (!response.ok) {
        throw new Error(
          await readMessage(
            response,
          ),
        );
      }

      const result =
        (await response.json()) as {
          user: SessionUser;
        };

      setUser(result.user);
      setPassword('');
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : 'Unable to sign in.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch(
      '/api/session/logout',
      {
        method: 'POST',
      },
    );

    setUser(null);
    setCheckout(null);
  }

  async function createCheckout(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setCheckout(null);

    try {
      const response =
        await fetch(
          '/api/checkout/create',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                drawId,
                ticketCount,
              }),
          },
        );

      if (!response.ok) {
        throw new Error(
          await readMessage(
            response,
          ),
        );
      }

      setCheckout(
        (await response.json()) as CheckoutPayload,
      );
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : 'Unable to prepare checkout.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className={
        styles.page
      }
    >
      <header
        className={
          styles.header
        }
      >
        <Link
          href="/"
          className={
            styles.brand
          }
        >
          Amazing Chance
        </Link>

        <Link
          href="/verify"
          className={
            styles.secondaryLink
          }
        >
          Verification portal
        </Link>
      </header>

      <section
        className={
          styles.hero
        }
      >
        <p
          className={
            styles.eyebrow
          }
        >
          Secure checkout
        </p>

        <h1>
          Buy lottery tickets
          through Stripe.
        </h1>

        <p>
          Create a purchase,
          securely confirm the
          payment and let the
          verified webhook pipeline
          issue your tickets.
        </p>
      </section>

      {checkingSession ? (
        <section
          className={
            styles.card
          }
        >
          Checking session...
        </section>
      ) : !user ? (
        <form
          className={
            styles.card
          }
          onSubmit={login}
        >
          <h2>
            Sign in
          </h2>

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(
                event,
              ) =>
                setEmail(
                  event.target
                    .value,
                )
              }
              required
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(
                event,
              ) =>
                setPassword(
                  event.target
                    .value,
                )
              }
              required
              autoComplete="current-password"
            />
          </label>

          <button
            className={
              styles.primaryButton
            }
            disabled={loading}
          >
            {loading
              ? 'Signing in...'
              : 'Sign in'}
          </button>
        </form>
      ) : (
        <>
          <section
            className={
              styles.sessionBar
            }
          >
            <div>
              Signed in as{' '}
              <strong>
                {user.email}
              </strong>
            </div>

            <button
              type="button"
              onClick={() =>
                void logout()
              }
            >
              Sign out
            </button>
          </section>

          <form
            className={
              styles.card
            }
            onSubmit={
              createCheckout
            }
          >
            <h2>
              Create purchase
            </h2>

            <div
              className={
                styles.summary
              }
            >
              <div>
                <span>
                  Current draw
                </span>
                <strong>
                  {checkingAvailability
                    ? 'Checking...'
                    : availability
                        ?.publicId ??
                      'Unavailable'}
                </strong>
              </div>

              <div>
                <span>
                  Sales status
                </span>
                <strong>
                  {availability
                    ?.available
                    ? 'Open'
                    : availability
                        ?.reason ??
                      'Unavailable'}
                </strong>
              </div>

              {availability
                ?.effectiveCutoffAt ? (
                <div>
                  <span>
                    Sales close
                  </span>
                  <strong>
                    {new Date(
                      availability
                        .effectiveCutoffAt,
                    ).toLocaleString()}
                  </strong>
                </div>
              ) : null}
            </div>

            <label>
              Number of tickets
              <input
                type="number"
                min={1}
                max={1000}
                value={
                  ticketCount
                }
                onChange={(
                  event,
                ) =>
                  setTicketCount(
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
                required
              />
            </label>

            <button
              className={
                styles.primaryButton
              }
              disabled={
                loading ||
                checkingAvailability ||
                !availability?.available
              }
            >
              {loading
                ? 'Preparing payment...'
                : 'Continue to payment'}
            </button>
          </form>
        </>
      )}

      {error ? (
        <section
          className={
            styles.errorCard
          }
          role="alert"
        >
          {error}
        </section>
      ) : null}

      {checkout ? (
        <section
          className={
            styles.card
          }
        >
          <div
            className={
              styles.summary
            }
          >
            <div>
              <span>
                Purchase
              </span>
              <strong>
                {
                  checkout
                    .purchase
                    .publicId
                }
              </strong>
            </div>

            <div>
              <span>
                Tickets
              </span>
              <strong>
                {
                  checkout
                    .purchase
                    .requestedTicketCount
                }
              </strong>
            </div>

            <div>
              <span>
                Total
              </span>
              <strong>
                {
                  checkout.payment
                    .amountMinor
                }{' '}
                {
                  checkout.payment
                    .currency
                }
              </strong>
            </div>
          </div>

          {!stripePromise ? (
            <p
              className={
                styles.error
              }
            >
              Stripe publishable key
              is not configured.
            </p>
          ) : (
            <Elements
              stripe={
                stripePromise
              }
              options={{
                clientSecret:
                  checkout.payment
                    .clientSecret,
                appearance,
              }}
            >
              <PaymentForm
                checkout={
                  checkout
                }
              />
            </Elements>
          )}
        </section>
      ) : null}
    </main>
  );
}
