import { AgeGateForm } from "@/components/age-gate-form";

export default async function AgeGatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-4xl font-bold text-center mb-2">Are you 18+?</h1>
      <p className="text-white/60 text-center mb-8">
        You must be 18 or older (21+ in some jurisdictions) to rip packs on PokéRip.
      </p>
      <AgeGateForm next={next ?? "/packs"} />
    </div>
  );
}
