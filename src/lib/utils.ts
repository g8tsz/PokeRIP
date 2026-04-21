import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUSD(cents: number | bigint, opts: { compact?: boolean } = {}) {
  const n = Number(cents) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.compact && Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
    notation: opts.compact ? "compact" : "standard",
  }).format(n);
}

export function formatOdds(weight: number, totalWeight: number) {
  const p = weight / totalWeight;
  if (p >= 0.01) return `${(p * 100).toFixed(2)}%`;
  if (p >= 0.0001) return `${(p * 100).toFixed(4)}%`;
  const oneIn = Math.round(1 / p);
  return `1 in ${oneIn.toLocaleString()}`;
}
