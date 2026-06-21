import type { AppCard } from "@bevo/agent-sdk";
import type { PolymarketMarket, BetResult } from "../types.js";

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

export function confirmationCard(
  market: PolymarketMarket,
  outcome: "YES" | "NO",
  result: BetResult
): AppCard {
  return {
    type: "app_card",
    title: "Bet placed",
    description: market.question,
    fields: [
      {
        label: "Your position",
        value: `${outcome} — $${result.amountUsdc.toFixed(2)} USDC`,
      },
      {
        label: "Entry price",
        value: `${Math.round(result.price * 100)}¢`,
      },
      {
        label: "Shares bought",
        value: result.shares.toFixed(4),
      },
      {
        label: "Max payout if correct",
        value: `$${result.maxPayout.toFixed(2)} USDC`,
      },
      {
        label: "Market ends",
        value: formatDate(market.endDate),
      },
      ...(result.transactionHash
        ? [
            {
              label: "Transaction",
              value: result.transactionHash.slice(0, 12) + "…",
            },
          ]
        : []),
    ],
    actions: [
      {
        id: "view",
        label: "View on Polymarket",
        type: "link" as const,
        url: `https://polymarket.com/event/${market.slug}`,
      },
      ...(result.transactionHash
        ? [
            {
              id: "tx",
              label: "View transaction",
              type: "link" as const,
              url: `https://polygonscan.com/tx/${result.transactionHash}`,
            },
          ]
        : []),
    ],
  };
}

export function insufficientFundsCard(
  balance: number,
  requested: number
): AppCard {
  return {
    type: "app_card",
    title: "Insufficient balance",
    description: `You tried to bet $${requested.toFixed(2)} USDC but your balance is only $${balance.toFixed(2)} USDC.`,
    fields: [
      { label: "Available", value: `$${balance.toFixed(2)} USDC` },
      { label: "Requested", value: `$${requested.toFixed(2)} USDC` },
    ],
    actions: [
      {
        id: "deposit",
        label: "Deposit more USDC",
        type: "action" as const,
      },
    ],
  };
}
