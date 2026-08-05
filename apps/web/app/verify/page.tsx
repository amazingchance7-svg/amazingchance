'use client';

import { FormEvent, useMemo, useState } from 'react';

import styles from './verify.module.css';

type MerkleProofNode = {
  hash: string;
  side: 'LEFT' | 'RIGHT';
};

type AuditManifest = {
  auditVersion: string;
  draw: {
    id: string;
    publicId: string;
    status: string;
    type: string;
    scheduledDrawAt: string;
    completedAt: string | null;
    publishedAt: string | null;
  };
  snapshot: {
    status: string;
    ticketCount: string;
    canonicalFormat: string;
    hashAlgorithm: string;
    snapshotHash: string;
    merkleRoot: string;
    builtAt: string | null;
    finalizedAt: string;
  };
  endpoints: {
    snapshotMetadata: string;
    snapshotDownload: string;
    ticketProofTemplate: string;
    proofVerification: string;
  };
};

type TicketProof = {
  drawId: string;
  drawPublicId: string;
  ticketPublicId: string;
  position: string;
  leafHash: string;
  leafIndex: number;
  proof: MerkleProofNode[];
  merkleRoot: string;
  snapshotHash: string;
  hashAlgorithm: string;
  canonicalFormat: string;
  verificationVersion: string;
};

type VerificationResponse = {
  valid: boolean;
  reason:
    | 'VERIFIED'
    | 'MERKLE_ROOT_MISMATCH'
    | 'INVALID_MERKLE_PROOF';
  drawId: string;
  drawPublicId: string;
  verificationVersion: string;
  hashAlgorithm: string;
  snapshotHash: string;
  officialMerkleRoot: string;
  suppliedMerkleRoot: string;
};

type VerificationState = {
  proof: TicketProof;
  result: VerificationResponse;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

function formatDate(value: string | null): string {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function shortenHash(value: string): string {
  if (value.length <= 24) {
    return value;
  }

  return `${value.slice(0, 12)}…${value.slice(-12)}`;
}

async function readErrorMessage(
  response: Response,
): Promise<string> {
  try {
    const body = (await response.json()) as {
      message?: string | string[];
    };

    if (Array.isArray(body.message)) {
      return body.message.join(', ');
    }

    if (typeof body.message === 'string') {
      return body.message;
    }
  } catch {
    // Response was not JSON.
  }

  return `Request failed with status ${response.status}`;
}

export default function VerifyPage() {
  const [drawId, setDrawId] = useState('');
  const [ticketPublicId, setTicketPublicId] =
    useState('');
  const [audit, setAudit] =
    useState<AuditManifest | null>(null);
  const [verification, setVerification] =
    useState<VerificationState | null>(null);
  const [loadingAudit, setLoadingAudit] =
    useState(false);
  const [loadingVerification, setLoadingVerification] =
    useState(false);
  const [error, setError] = useState<string | null>(
    null,
  );

  const normalizedDrawId = drawId.trim();
  const normalizedTicketPublicId =
    ticketPublicId.trim();

  const snapshotDownloadUrl = useMemo(() => {
    if (!audit) {
      return null;
    }

    return `${API_URL}${audit.endpoints.snapshotDownload}`;
  }, [audit]);

  async function loadAudit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!normalizedDrawId) {
      setError('Enter the lottery draw UUID.');
      return;
    }

    setLoadingAudit(true);
    setError(null);
    setAudit(null);
    setVerification(null);

    try {
      const response = await fetch(
        `${API_URL}/lottery-draws/${encodeURIComponent(
          normalizedDrawId,
        )}/audit`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response),
        );
      }

      setAudit(
        (await response.json()) as AuditManifest,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load the audit manifest.',
      );
    } finally {
      setLoadingAudit(false);
    }
  }

  async function verifyTicket(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!normalizedDrawId) {
      setError('Load a lottery draw first.');
      return;
    }

    if (!normalizedTicketPublicId) {
      setError('Enter the public ticket identifier.');
      return;
    }

    setLoadingVerification(true);
    setError(null);
    setVerification(null);

    try {
      const proofResponse = await fetch(
        `${API_URL}/lottery-draws/${encodeURIComponent(
          normalizedDrawId,
        )}/tickets/${encodeURIComponent(
          normalizedTicketPublicId,
        )}/proof`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (!proofResponse.ok) {
        throw new Error(
          await readErrorMessage(proofResponse),
        );
      }

      const proof =
        (await proofResponse.json()) as TicketProof;

      const verificationResponse = await fetch(
        `${API_URL}/lottery-draws/${encodeURIComponent(
          normalizedDrawId,
        )}/verify-proof`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            verificationVersion:
              proof.verificationVersion,
            leafHash: proof.leafHash,
            merkleRoot: proof.merkleRoot,
            proof: proof.proof,
          }),
        },
      );

      if (!verificationResponse.ok) {
        throw new Error(
          await readErrorMessage(
            verificationResponse,
          ),
        );
      }

      const result =
        (await verificationResponse.json()) as VerificationResponse;

      setVerification({
        proof,
        result,
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to verify the ticket.',
      );
    } finally {
      setLoadingVerification(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <span className={styles.brandMark}>AC</span>

          <span>
            <strong>Amazing Chance</strong>
            <small>Public verification portal</small>
          </span>
        </a>

        <span className={styles.securityBadge}>
          SHA-256 · Merkle proof
        </span>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>
          Independently verifiable lottery
        </p>

        <h1>Verify a draw and your ticket.</h1>

        <p className={styles.heroText}>
          Review the official snapshot commitment,
          download the canonical ticket list and
          independently verify that a ticket was included
          before the draw.
        </p>
      </section>

      <section className={styles.workspace}>
        <form
          className={styles.panel}
          onSubmit={loadAudit}
        >
          <div className={styles.panelHeading}>
            <span className={styles.step}>01</span>

            <div>
              <h2>Load draw audit</h2>
              <p>
                Enter the internal draw UUID published by
                Amazing Chance.
              </p>
            </div>
          </div>

          <label className={styles.label}>
            Lottery draw UUID
            <input
              className={styles.input}
              value={drawId}
              onChange={(event) =>
                setDrawId(event.target.value)
              }
              placeholder="00000000-0000-0000-0000-000000000000"
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          <button
            className={styles.primaryButton}
            type="submit"
            disabled={loadingAudit}
          >
            {loadingAudit
              ? 'Loading audit…'
              : 'Load audit manifest'}
          </button>
        </form>

        <form
          className={styles.panel}
          onSubmit={verifyTicket}
        >
          <div className={styles.panelHeading}>
            <span className={styles.step}>02</span>

            <div>
              <h2>Verify ticket</h2>
              <p>
                The ticket proof is checked against the
                finalized official Merkle root.
              </p>
            </div>
          </div>

          <label className={styles.label}>
            Public ticket identifier
            <input
              className={styles.input}
              value={ticketPublicId}
              onChange={(event) =>
                setTicketPublicId(event.target.value)
              }
              placeholder="TKT-..."
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          <button
            className={styles.secondaryButton}
            type="submit"
            disabled={
              loadingVerification || !audit
            }
          >
            {loadingVerification
              ? 'Verifying ticket…'
              : 'Verify ticket proof'}
          </button>
        </form>
      </section>

      {error ? (
        <section
          className={styles.errorCard}
          role="alert"
        >
          <strong>Verification request failed</strong>
          <p>{error}</p>
        </section>
      ) : null}

      {audit ? (
        <section className={styles.auditSection}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>
                Official audit manifest
              </p>
              <h2>{audit.draw.publicId}</h2>
            </div>

            <span className={styles.finalizedBadge}>
              {audit.snapshot.status}
            </span>
          </div>

          <div className={styles.metrics}>
            <article className={styles.metricCard}>
              <span>Tickets included</span>
              <strong>
                {audit.snapshot.ticketCount}
              </strong>
            </article>

            <article className={styles.metricCard}>
              <span>Hash algorithm</span>
              <strong>
                {audit.snapshot.hashAlgorithm}
              </strong>
            </article>

            <article className={styles.metricCard}>
              <span>Draw status</span>
              <strong>{audit.draw.status}</strong>
            </article>

            <article className={styles.metricCard}>
              <span>Finalized</span>
              <strong>
                {formatDate(
                  audit.snapshot.finalizedAt,
                )}
              </strong>
            </article>
          </div>

          <div className={styles.commitments}>
            <div className={styles.hashBlock}>
              <span>Snapshot SHA-256</span>
              <code title={audit.snapshot.snapshotHash}>
                {shortenHash(
                  audit.snapshot.snapshotHash,
                )}
              </code>
            </div>

            <div className={styles.hashBlock}>
              <span>Merkle Root</span>
              <code title={audit.snapshot.merkleRoot}>
                {shortenHash(
                  audit.snapshot.merkleRoot,
                )}
              </code>
            </div>
          </div>

          <div className={styles.actions}>
            {snapshotDownloadUrl ? (
              <a
                className={styles.primaryButton}
                href={snapshotDownloadUrl}
              >
                Download canonical snapshot
              </a>
            ) : null}

            <a
              className={styles.textLink}
              href={`${API_URL}${audit.endpoints.snapshotMetadata}`}
              target="_blank"
              rel="noreferrer"
            >
              Open snapshot metadata
            </a>
          </div>
        </section>
      ) : null}

      {verification ? (
        <section
          className={
            verification.result.valid
              ? styles.validResult
              : styles.invalidResult
          }
        >
          <div className={styles.resultIcon}>
            {verification.result.valid ? '✓' : '×'}
          </div>

          <div className={styles.resultContent}>
            <p className={styles.eyebrow}>
              Cryptographic verification
            </p>

            <h2>
              {verification.result.valid
                ? 'Ticket proof is valid'
                : 'Ticket proof is invalid'}
            </h2>

            <p>
              Result:{' '}
              <strong>
                {verification.result.reason}
              </strong>
            </p>

            <dl className={styles.resultDetails}>
              <div>
                <dt>Ticket</dt>
                <dd>
                  {
                    verification.proof
                      .ticketPublicId
                  }
                </dd>
              </div>

              <div>
                <dt>Snapshot position</dt>
                <dd>
                  {verification.proof.position}
                </dd>
              </div>

              <div>
                <dt>Proof nodes</dt>
                <dd>
                  {verification.proof.proof.length}
                </dd>
              </div>

              <div>
                <dt>Verification version</dt>
                <dd>
                  {
                    verification.result
                      .verificationVersion
                  }
                </dd>
              </div>
            </dl>
          </div>
        </section>
      ) : null}
    </main>
  );
}