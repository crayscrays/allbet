import type { AppCard } from "@bevo/agent-sdk";
import type { PolymarketMarket } from "../types.js";
import type { CardCtx } from "../types.js";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function searchResultsCard(
  markets: PolymarketMarket[],
  ctx: CardCtx
): AppCard {
  const fields = markets.map((m, i) => {
    // Polymarket uses "Yes"/"No" (not uppercase). Show all binary outcomes.
    const [first, second] = m.outcomes;
    const yesLabel = first ? `${first.name} ${Math.round(first.price * 100)}¢` : "—¢";
    const noLabel = second ? `${second.name} ${Math.round(second.price * 100)}¢` : "—¢";
    return {
      label: `${i + 1}. ${m.question.length > 65 ? m.question.slice(0, 62) + "…" : m.question}`,
      value: `${yesLabel} · ${noLabel} · ends ${formatDate(m.endDate)} · vol ${formatVolume(m.volume)}`,
    };
  });

  // Link buttons for the first 3 markets (card action limit)
  const actions = markets.slice(0, 3).map((m, i) => {
    const miniappUrl = new URL(`${ctx.agentApiBase}/miniapp`);
    miniappUrl.searchParams.set("market", m.conditionId);
    miniappUrl.searchParams.set("sender", ctx.senderId);
    miniappUrl.searchParams.set("group", String(ctx.groupId));
    miniappUrl.searchParams.set("channel", String(ctx.channelId));
    return {
      id: `bet_${i}`,
      label: `Bet on #${i + 1}`,
      type: "link" as const,
      url: miniappUrl.toString(),
    };
  });

  return {
    type: "app_card",
    title: `Found ${markets.length} prediction market${markets.length === 1 ? "" : "s"}`,
    description: "Tap a button to open the betting screen for that market.",
    fields,
    actions,
  };
}
