'use client';

import Link from 'next/link';
import {
  FormEvent,
  useMemo,
  useState,
} from 'react';

import styles from './verify.module.css';

type MerkleProofNode = {
  hash: string;
  side: 'LEFT' | 'RIGHT';
};

type PublicDrawResult = {
  resultVersion: string;
  draw: {
    id: string;
    publicId: string;
    type: string;
    status: string;
    scheduledDrawAt: string;
    completedAt: string;
    publishedAt: string;
    winnerCount: number;
  };
  snapshot: {
    ticketCount: string;
    snapshotHash: string;
    merkleRoot: string;
    hashAlgorithm: string;
    canonicalFormat: string;
    finalizedAt: string;
  };
  randomness: {
    evidenceId: string;
    provider: string;
    status: string;
    attemptNumber: number;
    requestedMin: string;
    requestedMax: string;
    requestedCount: number;
    responseHash: string;
    providerSignature: string;
    signatureVerified: true;
    randomPositions: unknown;
    requestedAt: string | null;
    receivedAt: string | null;
    verifiedAt: string;
  };
  winnerSelection: {
    algorithm: string;
    winners: Array<{
      rank: number;
      ticketPublicId: string;
      ownerPublicRef: string;
      randomPosition: string;
      prize: {
        amountMinor: string;
        currency: string;
        status: string;
      } | null;
    }>;
  };
  verification: {
    auditManifest: string;
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

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat(
    'en',
    {
      dateStyle: 'medium',
      timeStyle: 'medium',
    },
  ).format(
    new Date(value),
  );
}

function shortenHash(
  value: string,
): string {
  if (value.length <= 30) {
    return value;
  }

  return `${value.slice(
    0,
    14,
  )}...${value.slice(-14)}`;
}

function formatAlgorithm(
  value: string,
): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase();
}

function formatPrize(
  winner:
    PublicDrawResult['winnerSelection']['winners'][number],
): string {
  if (!winner.prize) {
    return 'Not assigned';
  }

  return `${winner.prize.amountMinor} ${winner.prize.currency} (minor units)`;
}

async function readErrorMessage(
  response: Response,
): Promise<string> {
  try {
    const body =
      (await response.json()) as {
        message?: string | string[];
      };

    if (
      Array.isArray(
        body.message,
      )
    ) {
      return body.message.join(
        ', ',
      );
    }

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

export default function VerifyPage() {
  const [
    drawId,
    setDrawId,
  ] = useState('');

  const [
    ticketPublicId,
    setTicketPublicId,
  ] = useState('');

  const [
    drawResult,
    setDrawResult,
  ] =
    useState<PublicDrawResult | null>(
      null,
    );

  const [
    verification,
    setVerification,
  ] =
    useState<VerificationState | null>(
      null,
    );

  const [
    loadingResult,
    setLoadingResult,
  ] = useState(false);

  const [
    loadingVerification,
    setLoadingVerification,
  ] = useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const normalizedDrawId =
    drawId.trim();

  const normalizedTicketPublicId =
    ticketPublicId.trim();

  const snapshotDownloadUrl =
    useMemo(() => {
      if (!drawResult) {
        return null;
      }

      return `${API_URL}${drawResult.verification.snapshotDownload}`;
    }, [drawResult]);

  const auditManifestUrl =
    useMemo(() => {
      if (!drawResult) {
        return null;
      }

      return `${API_URL}${drawResult.verification.auditManifest}`;
    }, [drawResult]);

  const snapshotMetadataUrl =
    useMemo(() => {
      if (!drawResult) {
        return null;
      }

      return `${API_URL}${drawResult.verification.snapshotMetadata}`;
    }, [drawResult]);

  async function loadDrawResult(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!normalizedDrawId) {
      setError(
        'Enter the lottery draw UUID.',
      );
      return;
    }

    setLoadingResult(true);
    setError(null);
    setDrawResult(null);
    setVerification(null);

    try {
      const response =
        await fetch(
          `${API_URL}/lottery-draws/${encodeURIComponent(
            normalizedDrawId,
          )}/result`,
          {
            method: 'GET',
            headers: {
              Accept:
                'application/json',
            },
          },
        );

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
          ),
        );
      }

      const result =
        (await response.json()) as PublicDrawResult;

      setDrawResult(result);
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : 'Unable to load the published draw result.',
      );
    } finally {
      setLoadingResult(false);
    }
  }

  async function verifyTicket(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!drawResult) {
      setError(
        'Load a published draw first.',
      );
      return;
    }

    if (
      !normalizedTicketPublicId
    ) {
      setError(
        'Enter the public ticket identifier.',
      );
      return;
    }

    setLoadingVerification(
      true,
    );
    setError(null);
    setVerification(null);

    try {
      const proofUrl =
        `${API_URL}${drawResult.verification.ticketProofTemplate.replace(
          '{ticketPublicId}',
          encodeURIComponent(
            normalizedTicketPublicId,
          ),
        )}`;

      const proofResponse =
        await fetch(
          proofUrl,
          {
            method: 'GET',
            headers: {
              Accept:
                'application/json',
            },
          },
        );

      if (
        !proofResponse.ok
      ) {
        throw new Error(
          await readErrorMessage(
            proofResponse,
          ),
        );
      }

      const proof =
        (await proofResponse.json()) as TicketProof;

      const verificationResponse =
        await fetch(
          `${API_URL}${drawResult.verification.proofVerification}`,
          {
            method: 'POST',
            headers: {
              Accept:
                'application/json',
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                verificationVersion:
                  proof.verificationVersion,
                leafHash:
                  proof.leafHash,
                merkleRoot:
                  proof.merkleRoot,
                proof:
                  proof.proof,
              }),
          },
        );

      if (
        !verificationResponse.ok
      ) {
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
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : 'Unable to verify the ticket.',
      );
    } finally {
      setLoadingVerification(
        false,
      );
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
          className={
            styles.brand
          }
          href="/"
        >
          <span
            className={
              styles.brandMark
            }
          >
            AC
          </span>

          <span>
            <strong>
              Amazing Chance
            </strong>

            <small>
              Public verification
              portal
            </small>
          </span>
        </Link>

        <span
          className={
            styles.securityBadge
          }
        >
          SHA-256  Merkle proof
        </span>
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
          Trust through
          verification
        </p>

        <h1>
          Verify the draw.
          Verify your ticket.
        </h1>

        <p
          className={
            styles.heroText
          }
        >
          Review the official
          published result,
          cryptographic snapshot,
          verified randomness and
          winning tickets. Then
          independently verify that
          any ticket was included
          before the draw.
        </p>
      </section>

      <section
        className={
          styles.workspace
        }
      >
        <form
          className={
            styles.panel
          }
          onSubmit={
            loadDrawResult
          }
        >
          <div
            className={
              styles.panelHeading
            }
          >
            <span
              className={
                styles.step
              }
            >
              01
            </span>

            <div>
              <h2>
                Load published
                result
              </h2>

              <p>
                Enter the official
                lottery draw UUID.
                Only published
                results are exposed.
              </p>
            </div>
          </div>

          <label
            className={
              styles.label
            }
          >
            Lottery draw UUID

            <input
              className={
                styles.input
              }
              value={
                drawId
              }
              onChange={(
                event,
              ) =>
                setDrawId(
                  event.target
                    .value,
                )
              }
              placeholder="00000000-0000-0000-0000-000000000000"
              spellCheck={
                false
              }
              autoComplete="off"
            />
          </label>

          <button
            className={
              styles.primaryButton
            }
            type="submit"
            disabled={
              loadingResult
            }
          >
            {loadingResult
              ? 'Loading result...'
              : 'Verify published draw'}
          </button>
        </form>

        <form
          className={
            styles.panel
          }
          onSubmit={
            verifyTicket
          }
        >
          <div
            className={
              styles.panelHeading
            }
          >
            <span
              className={
                styles.step
              }
            >
              02
            </span>

            <div>
              <h2>
                Verify ticket
              </h2>

              <p>
                Check a public ticket
                identifier against
                the official finalized
                Merkle root.
              </p>
            </div>
          </div>

          <label
            className={
              styles.label
            }
          >
            Public ticket identifier

            <input
              className={
                styles.input
              }
              value={
                ticketPublicId
              }
              onChange={(
                event,
              ) =>
                setTicketPublicId(
                  event.target
                    .value,
                )
              }
              placeholder="TKT-..."
              spellCheck={
                false
              }
              autoComplete="off"
            />
          </label>

          <button
            className={
              styles.secondaryButton
            }
            type="submit"
            disabled={
              loadingVerification ||
              !drawResult
            }
          >
            {loadingVerification
              ? 'Verifying ticket...'
              : 'Verify ticket proof'}
          </button>
        </form>
      </section>

      {error ? (
        <section
          className={
            styles.errorCard
          }
          role="alert"
        >
          <strong>
            Verification request
            failed
          </strong>

          <p>
            {error}
          </p>
        </section>
      ) : null}

      {drawResult ? (
        <>
          <section
            className={
              styles.auditSection
            }
          >
            <div
              className={
                styles.sectionHeading
              }
            >
              <div>
                <p
                  className={
                    styles.eyebrow
                  }
                >
                  Official published
                  result
                </p>

                <h2>
                  {
                    drawResult.draw
                      .publicId
                  }
                </h2>
              </div>

              <span
                className={
                  styles.finalizedBadge
                }
              >
                {
                  drawResult.draw
                    .status
                }
              </span>
            </div>

            <div
              className={
                styles.metrics
              }
            >
              <article
                className={
                  styles.metricCard
                }
              >
                <span>
                  Tickets included
                </span>

                <strong>
                  {
                    drawResult
                      .snapshot
                      .ticketCount
                  }
                </strong>
              </article>

              <article
                className={
                  styles.metricCard
                }
              >
                <span>
                  Winners
                </span>

                <strong>
                  {
                    drawResult.draw
                      .winnerCount
                  }
                </strong>
              </article>

              <article
                className={
                  styles.metricCard
                }
              >
                <span>
                  Completed
                </span>

                <strong>
                  {formatDate(
                    drawResult.draw
                      .completedAt,
                  )}
                </strong>
              </article>

              <article
                className={
                  styles.metricCard
                }
              >
                <span>
                  Published
                </span>

                <strong>
                  {formatDate(
                    drawResult.draw
                      .publishedAt,
                  )}
                </strong>
              </article>
            </div>

            <div
              className={
                styles.commitments
              }
            >
              <div
                className={
                  styles.hashBlock
                }
              >
                <span>
                  Snapshot SHA-256
                </span>

                <code
                  title={
                    drawResult
                      .snapshot
                      .snapshotHash
                  }
                >
                  {shortenHash(
                    drawResult
                      .snapshot
                      .snapshotHash,
                  )}
                </code>
              </div>

              <div
                className={
                  styles.hashBlock
                }
              >
                <span>
                  Merkle Root
                </span>

                <code
                  title={
                    drawResult
                      .snapshot
                      .merkleRoot
                  }
                >
                  {shortenHash(
                    drawResult
                      .snapshot
                      .merkleRoot,
                  )}
                </code>
              </div>
            </div>

            <div
              className={
                styles.actions
              }
            >
              {snapshotDownloadUrl ? (
                <a
                  className={
                    styles.primaryButton
                  }
                  href={
                    snapshotDownloadUrl
                  }
                >
                  Download canonical
                  snapshot
                </a>
              ) : null}

              {auditManifestUrl ? (
                <a
                  className={
                    styles.textLink
                  }
                  href={
                    auditManifestUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Open audit manifest
                </a>
              ) : null}

              {snapshotMetadataUrl ? (
                <a
                  className={
                    styles.textLink
                  }
                  href={
                    snapshotMetadataUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Snapshot metadata
                </a>
              ) : null}
            </div>
          </section>

          <section
            className={
              styles.auditSection
            }
          >
            <div
              className={
                styles.sectionHeading
              }
            >
              <div>
                <p
                  className={
                    styles.eyebrow
                  }
                >
                  Verified randomness
                </p>

                <h2>
                  {
                    drawResult
                      .randomness
                      .provider
                  }
                </h2>
              </div>

              <span
                className={
                  styles.finalizedBadge
                }
              >
                Signature verified
              </span>
            </div>

            <div
              className={
                styles.metrics
              }
            >
              <article
                className={
                  styles.metricCard
                }
              >
                <span>
                  Evidence status
                </span>

                <strong>
                  {
                    drawResult
                      .randomness
                      .status
                  }
                </strong>
              </article>

              <article
                className={
                  styles.metricCard
                }
              >
                <span>
                  Attempt
                </span>

                <strong>
                  #
                  {
                    drawResult
                      .randomness
                      .attemptNumber
                  }
                </strong>
              </article>

              <article
                className={
                  styles.metricCard
                }
              >
                <span>
                  Random values
                </span>

                <strong>
                  {
                    drawResult
                      .randomness
                      .requestedCount
                  }
                </strong>
              </article>

              <article
                className={
                  styles.metricCard
                }
              >
                <span>
                  Verified
                </span>

                <strong>
                  {formatDate(
                    drawResult
                      .randomness
                      .verifiedAt,
                  )}
                </strong>
              </article>
            </div>

            <div
              className={
                styles.commitments
              }
            >
              <div
                className={
                  styles.hashBlock
                }
              >
                <span>
                  Randomness response
                  hash
                </span>

                <code
                  title={
                    drawResult
                      .randomness
                      .responseHash
                  }
                >
                  {shortenHash(
                    drawResult
                      .randomness
                      .responseHash,
                  )}
                </code>
              </div>

              <div
                className={
                  styles.hashBlock
                }
              >
                <span>
                  Provider signature
                </span>

                <code
                  title={
                    drawResult
                      .randomness
                      .providerSignature
                  }
                >
                  {shortenHash(
                    drawResult
                      .randomness
                      .providerSignature,
                  )}
                </code>
              </div>
            </div>

            <div
              className={
                styles.hashBlock
              }
              style={{
                marginTop: 20,
              }}
            >
              <span>
                Winner selection
                algorithm
              </span>

              <code>
                {formatAlgorithm(
                  drawResult
                    .winnerSelection
                    .algorithm,
                )}
              </code>
            </div>
          </section>

          <section
            className={
              styles.auditSection
            }
          >
            <div
              className={
                styles.sectionHeading
              }
            >
              <div>
                <p
                  className={
                    styles.eyebrow
                  }
                >
                  Official winners
                </p>

                <h2>
                  Ranked winning
                  tickets
                </h2>
              </div>

              <span
                className={
                  styles.finalizedBadge
                }
              >
                {
                  drawResult
                    .winnerSelection
                    .winners.length
                }{' '}
                winners
              </span>
            </div>

            <div
              className={
                styles.metrics
              }
            >
              {drawResult.winnerSelection.winners.map(
                (winner) => (
                  <article
                    className={
                      styles.metricCard
                    }
                    key={
                      winner.rank
                    }
                  >
                    <span>
                      Rank #
                      {
                        winner.rank
                      }
                    </span>

                    <strong>
                      {
                        winner.ticketPublicId
                      }
                    </strong>

                    <span
                      style={{
                        marginTop: 14,
                      }}
                    >
                      Random position
                    </span>

                    <strong>
                      {
                        winner.randomPosition
                      }
                    </strong>

                    <span
                      style={{
                        marginTop: 14,
                      }}
                    >
                      Prize
                    </span>

                    <strong>
                      {formatPrize(
                        winner,
                      )}
                    </strong>
                  </article>
                ),
              )}
            </div>
          </section>
        </>
      ) : null}

      {verification ? (
        <section
          className={
            verification.result.valid
              ? styles.validResult
              : styles.invalidResult
          }
        >
          <div
            className={
              styles.resultIcon
            }
          >
            {verification.result.valid
              ? 'OK'
              : 'X'}
          </div>

          <div
            className={
              styles.resultContent
            }
          >
            <p
              className={
                styles.eyebrow
              }
            >
              Cryptographic
              verification
            </p>

            <h2>
              {verification.result.valid
                ? 'Ticket proof is valid'
                : 'Ticket proof is invalid'}
            </h2>

            <p>
              Result:{' '}
              <strong>
                {
                  verification
                    .result.reason
                }
              </strong>
            </p>

            <dl
              className={
                styles.resultDetails
              }
            >
              <div>
                <dt>
                  Ticket
                </dt>

                <dd>
                  {
                    verification
                      .proof
                      .ticketPublicId
                  }
                </dd>
              </div>

              <div>
                <dt>
                  Snapshot position
                </dt>

                <dd>
                  {
                    verification
                      .proof
                      .position
                  }
                </dd>
              </div>

              <div>
                <dt>
                  Proof nodes
                </dt>

                <dd>
                  {
                    verification
                      .proof
                      .proof.length
                  }
                </dd>
              </div>

              <div>
                <dt>
                  Verification version
                </dt>

                <dd>
                  {
                    verification
                      .result
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
