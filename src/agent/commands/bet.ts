import type { CommandContext } from "@bevo/agent-sdk";
import { searchMarkets } from "../../services/polymarket.js";
import { getAgentWalletInfo } from "../../services/wallet.js";
import { getBalance } from "../../services/userBalance.js";
import { onboardingCard } from "../../cards/onboarding.js";
import { searchResultsCard } from "../../cards/searchResults.js";

export async function betCommand(ctx: CommandContext): Promise<void> {
  const query = String(ctx.payload.options.query ?? "").trim();
  if (!query) {
    ctx.reply("Please provide a search query. Example: /bet trump wins 2026");
    return;
  }

  // Defer so we can do async work (search + balance check)
  const deferred = await ctx.defer();

  const senderId = ctx.payload.senderId;
  const agentApiBase = process.env.MINIAPP_URL ?? "http://localhost:3000";

  try {
    // 1. Check agent wallet for total USDC (show onboarding if dry)
    const walletInfo = await getAgentWalletInfo();

    // 2. Check this user's tracked balance
    const userBalance = getBalance(senderId);

    if (userBalance <= 0) {
      await deferred.updateCard(
        onboardingCard(walletInfo.address, userBalance)
      );
      return;
    }

    // 3. Search Polymarket
    const markets = await searchMarkets(query, { limit: 5 });

    if (markets.length === 0) {
      await deferred.update(
        `No active prediction markets found for: "${query}". Try a different search term.`
      );
      return;
    }

    // 4. Return search results card with miniapp links
    await deferred.updateCard(
      searchResultsCard(markets, {
        groupId: ctx.payload.groupId ?? 0,
        channelId: ctx.payload.channelId ?? 0,
        senderId,
        agentApiBase,
      })
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";
    await deferred.update(`Failed to search markets: ${message}`);
  }
}
