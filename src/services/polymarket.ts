import type { PolymarketMarket, PolymarketOutcome } from "../types.js";

const GAMMA_API = "https://gamma-api.polymarket.com";
const CLOB_API = "https://clob.polymarket.com";

// Real shape returned by Gamma API
interface GammaMarket {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  description: string;
  endDate: string;
  endDateIso: string;
  volume: number;
  volumeNum: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  image: string;
  icon: string;
  // These fields are JSON strings when returned from Gamma API
  outcomes: string; // e.g. '["Yes","No"]'
  outcomePrices: string; // e.g. '["0.65","0.35"]'
  clobTokenIds: string; // e.g. '["<token_id_1>","<token_id_2>"]'
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  acceptingOrders: boolean;
}

function parseJson<T>(raw: string | T): T {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }
  return raw;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json() as Promise<T>;
}

function gammaToMarket(m: GammaMarket): PolymarketMarket | null {
  const outcomeNames = parseJson<string[]>(m.outcomes);
  const outcomePrices = parseJson<string[]>(m.outcomePrices);
  const tokenIds = parseJson<string[]>(m.clobTokenIds);

  if (
    !Array.isArray(outcomeNames) ||
    !Array.isArray(outcomePrices) ||
    outcomeNames.length < 2
  ) {
    return null;
  }

  const outcomes: PolymarketOutcome[] = outcomeNames.map((name, i) => ({
    name,
    tokenId: tokenIds?.[i] ?? "",
    price: parseFloat(outcomePrices[i] ?? "0.5") || 0.5,
  }));

  return {
    conditionId: m.conditionId,
    slug: m.slug,
    question: m.question,
    description: m.description ?? "",
    endDate: m.endDateIso ?? m.endDate,
    volume: m.volumeNum ?? m.volume ?? 0,
    outcomes,
    image: m.image ?? m.icon,
  };
}

/**
 * Search Polymarket for active prediction markets matching the query.
 * Returns up to `limit` markets sorted by volume descending.
 *
 * Binary (YES/NO) markets are sorted first; multi-outcome markets are included
 * but labelled with their actual outcome names (e.g. team names).
 */
export async function searchMarkets(
  query: string,
  options: { limit?: number } = {}
): Promise<PolymarketMarket[]> {
  const limit = options.limit ?? 5;
  // Fetch more than requested so we can filter and still hit the limit
  const url =
    `${GAMMA_API}/markets` +
    `?q=${encodeURIComponent(query)}` +
    `&active=true&closed=false` +
    `&limit=${limit * 3}` +
    `&order=volume&ascending=false`;

  const raw = await fetchJson<GammaMarket[]>(url);

  const markets: PolymarketMarket[] = [];
  for (const m of raw) {
    if (!m.active || m.closed) continue;
    const parsed = gammaToMarket(m);
    if (parsed) markets.push(parsed);
    if (markets.length >= limit) break;
  }

  return markets;
}

/**
 * Fetch a single market by conditionId with live prices.
 */
export async function getMarket(conditionId: string): Promise<PolymarketMarket> {
  // Gamma API returns the market directly by conditionId
  const url = `${GAMMA_API}/markets/${encodeURIComponent(conditionId)}`;
  const m = await fetchJson<GammaMarket>(url);

  const parsed = gammaToMarket(m);
  if (!parsed) {
    throw new Error(`Market ${conditionId} has no valid outcomes`);
  }

  // Refresh prices from CLOB book if we have token IDs
  if (parsed.outcomes.length === 2 && parsed.outcomes[0].tokenId) {
    try {
      const [yesBook, noBook] = await Promise.all(
        parsed.outcomes.map((o) =>
          fetchJson<{ asks: Array<{ price: string }> }>(
            `${CLOB_API}/book?token_id=${encodeURIComponent(o.tokenId)}`
          )
        )
      );
      const yesAsk = parseFloat(yesBook.asks[0]?.price ?? "0");
      const noAsk = parseFloat(noBook.asks[0]?.price ?? "0");
      if (yesAsk > 0) parsed.outcomes[0].price = yesAsk;
      if (noAsk > 0) parsed.outcomes[1].price = noAsk;
    } catch {
      // Keep Gamma prices as fallback
    }
  }

  return parsed;
}
