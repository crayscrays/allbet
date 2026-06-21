import { BevoAgent } from "@bevo/agent-sdk";
import { betCommand } from "./commands/bet.js";

export function createAgent(): BevoAgent {
  const apiKey = process.env.BEVO_API_KEY ?? "placeholder";
  const apiBase = process.env.BEVO_API_BASE ?? "http://localhost:5000";

  if (apiKey === "placeholder") {
    console.warn("[agent] BEVO_API_KEY not set — webhook will receive requests but Bevo API calls will fail");
  }

  const agent = new BevoAgent({ apiKey, apiBase });

  agent.command("bet", betCommand, {
    description: "Search Polymarket prediction markets and place a bet",
    options: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "What do you want to bet on? (e.g. 'trump wins 2026')",
      },
    ],
  });

  return agent;
}
