import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <section className="card">
        <p className="eyebrow">
          Amazing Chance
        </p>

        <h1>
          Transparent lottery.
          Verifiable outcomes.
        </h1>

        <p>
          Buy tickets through the
          secure checkout or review
          finalized draw commitments,
          canonical snapshots and
          independent Merkle proofs.
        </p>

        <Link href="/checkout">
          Buy tickets
        </Link>

        <br />

        <Link href="/verify">
          Open verification portal
        </Link>
      </section>
    </main>
  );
}
