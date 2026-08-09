import CheckoutResultClient from './checkout-result-client';

export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: Promise<{ purchaseId?: string }>;
}) {
  const params = await searchParams;
  const purchaseId = params.purchaseId?.trim();

  if (!purchaseId) {
    return (
      <main>
        <section className="card">
          <p className="eyebrow">Invalid checkout return</p>
          <h1>Purchase identifier is missing.</h1>
          <p>Return to checkout and start the payment flow again.</p>
        </section>
      </main>
    );
  }

  return <CheckoutResultClient purchaseId={purchaseId} />;
}
