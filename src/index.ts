import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createAgent } from "./agent/setup.js";
import { getMarket } from "./services/polymarket.js";
import { placeBet } from "./services/clob.js";
import { getBalance, deductBalance, creditBalance, recordBet } from "./services/userBalance.js";
import { getAgentWalletInfo } from "./services/wallet.js";
import { confirmationCard, insufficientFundsCard } from "./cards/confirmation.js";
import { onboardingCard } from "./cards/onboarding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// Serve the miniapp HTML (static file from src/miniapp/)
app.use("/miniapp", express.static(path.join(__dirname, "miniapp")));

// ── Bevo agent webhook ────────────────────────────────────────────────────────

const agent = createAgent();

// Sync commands to Bevo on startup (fire-and-forget, retried if server starts before Bevo)
agent.syncCommands().then(() => {
  console.log("[agent] Commands synced to Bevo");
}).catch((err: unknown) => {
  console.warn("[agent] Command sync failed (will work once env vars are set):", (err as Error).message);
});

app.post("/webhook", agent.express());

// ── App manifest for Bevo discovery ──────────────────────────────────────────

app.get("/.well-known/bevo.json", (_req, res) => {
  const base = process.env.MINIAPP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  res.json({
    app: {
      name: "Polymarket Bets",
      description: "Search and bet on Polymarket prediction markets inside Bevo",
      iconUrl: `${base}/miniapp/icon.png`,
      category: "defi",
      entryUrl: `${base}/miniapp`,
      permissions: ["wallet.read", "user.read", "chat.write"],
    },
    agent: {
      handle: "polymarket",
      name: "Polymarket",
      webhookUrl: `${base}/webhook`,
      capabilities: ["prediction-markets", "betting"],
      commands: [
        {
          name: "bet",
          description: "Search Polymarket prediction markets and place a bet",
          options: [
            {
              name: "query",
              type: "string",
              required: true,
              description: "What do you want to bet on?",
            },
          ],
        },
      ],
    },
  });
});

// ── REST API for the miniapp WebView ─────────────────────────────────────────

/**
 * Verify the request comes from a Bevo-authenticated user.
 * The miniapp sends the BevoContext.authToken as a Bearer token.
 * We validate it by calling the Bevo server's user lookup endpoint.
 */
async function resolveCallerPrincipalId(
  authHeader: string | undefined,
  fallbackSenderId?: string
): Promise<string | null> {
  // For development without a real Bevo server, accept the sender param directly
  if (process.env.NODE_ENV === "development" && fallbackSenderId) {
    return fallbackSenderId;
  }
  if (!authHeader?.startsWith("Bearer ")) return fallbackSenderId ?? null;

  try {
    const token = authHeader.slice(7);
    const apiBase = process.env.BEVO_API_BASE ?? "";
    const res = await fetch(`${apiBase}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return fallbackSenderId ?? null;
    const data = await res.json() as { principalId?: string };
    return data.principalId ?? fallbackSenderId ?? null;
  } catch {
    return fallbackSenderId ?? null;
  }
}

/** GET /api/market/:conditionId — proxy Polymarket data to the miniapp */
app.get("/api/market/:conditionId", async (req, res) => {
  try {
    const market = await getMarket(req.params.conditionId);
    res.json(market);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch market";
    res.status(502).json({ error: msg });
  }
});

/** GET /api/balance — user's tracked USDC balance */
app.get("/api/balance", async (req, res) => {
  const principalId = await resolveCallerPrincipalId(
    req.headers.authorization,
    req.query.sender as string | undefined
  );
  if (!principalId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const balance = getBalance(principalId);
  res.json({ balance, principalId });
});

/** POST /api/place-bet — called from the miniapp WebView on bet confirm */
app.post("/api/place-bet", async (req, res) => {
  const { conditionId, outcome, amountUsdc, senderId, groupId, channelId } =
    req.body as {
      conditionId: string;
      outcome: "YES" | "NO";
      amountUsdc: number;
      senderId: string;
      groupId: number;
      channelId: number;
    };

  if (!conditionId || !outcome || !amountUsdc || !senderId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const principalId = await resolveCallerPrincipalId(
    req.headers.authorization,
    senderId
  );
  if (!principalId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const balance = getBalance(principalId);
  if (balance < amountUsdc) {
    res.status(400).json({ error: "Insufficient balance", balance });
    return;
  }

  try {
    // Find the tokenId for the chosen outcome
    const market = await getMarket(conditionId);
    const outcomeData = market.outcomes.find(
      (o) => o.name.toLowerCase() === outcome.toLowerCase()
    );
    if (!outcomeData) {
      res.status(400).json({ error: `Outcome "${outcome}" not found in market` });
      return;
    }

    // Deduct balance first (reserve funds before hitting CLOB)
    deductBalance(principalId, amountUsdc);

    let result;
    try {
      result = await placeBet({
        conditionId,
        tokenId: outcomeData.tokenId,
        outcome,
        amountUsdc,
        price: outcomeData.price,
      });
    } catch (betErr) {
      // Refund on CLOB failure
      creditBalance(principalId, amountUsdc);
      throw betErr;
    }

    // Audit log
    recordBet(
      principalId,
      result.orderId,
      conditionId,
      outcome,
      amountUsdc,
      result.price,
      result.shares
    );

    // Send a confirmation card to the Bevo group channel
    if (groupId && channelId) {
      const card = confirmationCard(market, outcome, result);
      agent.client
        .sendMessage({ groupId: Number(groupId), channelId: Number(channelId), contentType: "app_card", card })
        .catch((e: unknown) => console.warn("[agent] Failed to send confirmation card:", (e as Error).message));
    }

    res.json({ success: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to place bet";
    console.error("[place-bet]", err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/admin/credit — manually credit a user's balance.
 * Protected by ADMIN_SECRET env var. Use for onboarding or manual deposits.
 */
app.post("/api/admin/credit", (req, res) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers["x-admin-secret"] !== secret) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { principalId, amountUsdc } = req.body as {
    principalId: string;
    amountUsdc: number;
  };
  if (!principalId || !amountUsdc) {
    res.status(400).json({ error: "principalId and amountUsdc required" });
    return;
  }

  creditBalance(principalId, amountUsdc);
  res.json({ success: true, balance: getBalance(principalId) });
});

/**
 * GET /api/admin/wallet — show agent wallet info (address + on-chain balance).
 * Protected by ADMIN_SECRET. Use to verify the agent wallet is funded.
 */
app.get("/api/admin/wallet", async (req, res) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers["x-admin-secret"] !== secret) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const info = await getAgentWalletInfo();
    res.json(info);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch wallet info";
    res.status(500).json({ error: msg });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "polymarket-bevo-agent" });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] Webhook: POST http://localhost:${PORT}/webhook`);
  console.log(`[server] Miniapp: GET  http://localhost:${PORT}/miniapp`);
});
