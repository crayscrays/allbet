import type { AppCard } from "@bevo/agent-sdk";
import type { Address } from "viem";

export function onboardingCard(agentAddress: Address, usdcBalance: number): AppCard {
  return {
    type: "app_card",
    title: "Fund your bet wallet to get started",
    description:
      "Send USDC on Polygon to the address below. Funds usually arrive in under a minute. Once received, run /bet again to start betting.",
    fields: [
      {
        label: "Deposit address (Polygon network)",
        value: agentAddress,
      },
      {
        label: "Token",
        value: "USDC (PoS) — do NOT send native MATIC",
      },
      {
        label: "Current balance",
        value: `$${usdcBalance.toFixed(2)} USDC`,
      },
      {
        label: "Minimum deposit",
        value: "$1.00 USDC",
      },
    ],
    actions: [
      {
        id: "polygonscan",
        label: "View on Polygonscan",
        type: "link",
        url: `https://polygonscan.com/address/${agentAddress}`,
      },
    ],
  };
}
