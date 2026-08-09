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
          secure checkout, review
          your account history or
          inspect finalized draw
          commitments and proofs.
        </p>

        <Link href="/checkout">
          Buy tickets
        </Link>

        <br />

        <Link href="/account">
          My account
        </Link>

        <br />

        <Link href="/verify">
          Open verification portal
        </Link>
      </section>
    </main>
  );
}
