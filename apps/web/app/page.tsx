import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <section className="card">
        <p className="eyebrow">Amazing Chance</p>

        <h1>
          Transparent lottery verification is available.
        </h1>

        <p>
          Review finalized draw commitments, download the
          canonical snapshot and independently verify that
          a ticket was included in the official draw.
        </p>

        <Link href="/verify">
          Open verification portal
        </Link>
      </section>
    </main>
  );
}
