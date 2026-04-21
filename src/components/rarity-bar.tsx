type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

const COLORS: Record<Rarity, string> = {
  common: "#b0b0b0",
  uncommon: "#5ce1a7",
  rare: "#5ab0ff",
  epic: "#b86cff",
  legendary: "#ffb84d",
  mythic: "#ff4d6d",
};

export function RarityBar({
  rarity,
  count,
  percentage,
}: {
  rarity: Rarity;
  count: number;
  percentage: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className={`text-rarity-${rarity} uppercase tracking-widest text-xs font-semibold`}>
          {rarity}
        </span>
        <span className="text-white/50 text-xs">
          {count.toLocaleString()} · {percentage.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${Math.max(percentage, percentage > 0 ? 1 : 0)}%`,
            background: `linear-gradient(90deg, ${COLORS[rarity]}66, ${COLORS[rarity]})`,
            boxShadow: percentage > 0 ? `0 0 18px -4px ${COLORS[rarity]}` : undefined,
          }}
        />
      </div>
    </div>
  );
}
