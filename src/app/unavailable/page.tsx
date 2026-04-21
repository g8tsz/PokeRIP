export default async function UnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const msg =
    reason === "country"
      ? "PokéRip is currently only available in the United States."
      : reason === "state"
        ? "Due to local regulations, PokéRip isn't available in your state yet."
        : "This feature isn't available in your location.";

  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <div className="text-6xl mb-4">🚫</div>
      <h1 className="font-display text-4xl font-bold">Unavailable</h1>
      <p className="text-white/60 mt-4">{msg}</p>
      <p className="text-white/40 text-sm mt-8">
        Think this is a mistake? Email{" "}
        <a className="underline" href="mailto:support@pokerip.example">
          support@pokerip.example
        </a>
        .
      </p>
    </div>
  );
}
