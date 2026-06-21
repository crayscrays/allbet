export interface PolymarketOutcome {
  name: string; // "YES" | "NO"
  tokenId: string;
  price: number; // 0.0–1.0 (probability)
}

export interface PolymarketMarket {
  conditionId: string;
  slug: string;
  question: string;
  description: string;
  endDate: string; // ISO date
  volume: number; // total USDC traded
  outcomes: PolymarketOutcome[];
  image?: string;
}

export interface BetOrder {
  conditionId: string;
  tokenId: string;
  outcome: "YES" | "NO";
  amountUsdc: number;
  price: number;
}

export interface BetResult {
  orderId: string;
  transactionHash?: string;
  conditionId: string;
  outcome: "YES" | "NO";
  amountUsdc: number;
  price: number;
  shares: number;
  maxPayout: number;
}

export interface CardCtx {
  groupId: number | string;
  channelId: number | string;
  senderId: string;
  agentApiBase: string;
}
