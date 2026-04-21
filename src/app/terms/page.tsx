export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 prose prose-invert">
      <h1 className="font-display text-4xl font-bold">Terms of Service</h1>
      <p className="text-white/50 text-sm">Last updated: {new Date().toLocaleDateString()}</p>

      <p className="mt-6 text-white/70">
        These are placeholder Terms. Before going live, you MUST have a gambling/sweepstakes
        attorney review your terms, state eligibility, KYC requirements, dispute resolution,
        and any applicable state-specific disclosures.
      </p>

      <h2 className="mt-8">Eligibility</h2>
      <p>You must be at least 18 years old (21 where required) and a resident of a supported jurisdiction.</p>

      <h2 className="mt-8">Mechanics</h2>
      <p>Each pack has a published loot table. Outcomes are determined by a provably-fair RNG. See /fairness.</p>

      <h2 className="mt-8">Payouts</h2>
      <p>Payouts via ACH are subject to KYC verification and Stripe Connect acceptance.</p>
    </article>
  );
}
