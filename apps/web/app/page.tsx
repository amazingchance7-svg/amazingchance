export default function HomePage() {
  return (
    <main>
      <section className="card">
        <p className="eyebrow">Amazing Chance</p>
        <h1>Development foundation is running.</h1>
        <p>The next implementation milestone is user registration and authentication.</p>
        <a href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/health`}>
          Check API health
        </a>
      </section>
    </main>
  );
}
