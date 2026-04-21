"use client";

import { useState } from "react";
import { formatUSD } from "@/lib/utils";

type Address = {
  id: string;
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};

function estimateShipping(totalValueCents: number): number {
  if (totalValueCents >= 50000) return 2500; // $25 insured/tracked for $500+
  if (totalValueCents >= 10000) return 800; // $8 tracked
  return 400; // $4 bubble mailer
}

export function ShippingForm({
  unitIds,
  addresses,
  totalValueCents,
}: {
  unitIds: string[];
  addresses: Address[];
  totalValueCents: number;
}) {
  const [addressId, setAddressId] = useState<string | "new">(addresses[0]?.id ?? "new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postal_code: "",
    country: "US",
  });
  const shipping = estimateShipping(totalValueCents);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (unitIds.length === 0) {
      setError("Pick at least one card to ship from your inventory.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shipping/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unit_ids: unitIds,
          address_id: addressId === "new" ? null : addressId,
          new_address: addressId === "new" ? form : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "shipping_failed");
      location.href = "/inventory?shipped=1";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass-strong rounded-2xl p-6 space-y-5">
      <div className="font-semibold">Shipping address</div>

      {addresses.length > 0 && (
        <div className="space-y-2">
          {addresses.map((a) => (
            <label key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 cursor-pointer">
              <input
                type="radio"
                checked={addressId === a.id}
                onChange={() => setAddressId(a.id)}
                className="mt-1"
              />
              <div className="text-sm">
                <div className="font-medium">{a.name}</div>
                <div className="text-white/60">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.region} {a.postal_code}
                </div>
              </div>
            </label>
          ))}
          <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 cursor-pointer">
            <input
              type="radio"
              checked={addressId === "new"}
              onChange={() => setAddressId("new")}
            />
            <span className="text-sm">Use a new address</span>
          </label>
        </div>
      )}

      {addressId === "new" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field label="Address line 1" value={form.line1} onChange={(v) => setForm({ ...form, line1: v })} required />
          <Field label="Address line 2" value={form.line2} onChange={(v) => setForm({ ...form, line2: v })} />
          <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} required />
          <Field label="State" value={form.region} onChange={(v) => setForm({ ...form, region: v.toUpperCase() })} required />
          <Field label="ZIP" value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} required />
        </div>
      )}

      <div className="flex items-center justify-between text-sm border-t border-white/10 pt-4">
        <div>
          <div className="text-white/60">Shipping</div>
          <div className="font-semibold">{formatUSD(shipping)}</div>
        </div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "…" : `Ship ${unitIds.length} card${unitIds.length === 1 ? "" : "s"}`}
        </button>
      </div>

      {error && <div className="text-sm text-accent-pink">{error}</div>}
      <p className="text-[11px] text-white/40">
        Shipping fee is deducted from your wallet. Packed within 1 business day. You&apos;ll get a
        tracking number by email.
      </p>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-white/40">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full bg-bg-soft border border-white/10 rounded-xl px-4 py-2 text-sm"
      />
    </div>
  );
}
