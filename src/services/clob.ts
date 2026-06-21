/**
 * Polymarket CLOB order placement.
 *
 * L2 key derivation: Polymarket derives a deterministic API key pair from the
 * wallet by signing a fixed message. We do this once on startup and cache the
 * credentials in memory for the lifetime of the process.
 *
 * Reference: https://docs.polymarket.com/#authentication
 */

import { privateKeyToAccount, signMessage } from "viem/accounts";
import { createPublicClient, http, parseUnits, type Address } from "viem";
import { polygon } from "viem/chains";
import { createHmac } from "crypto";
import type { BetOrder, BetResult } from "../types.js";

const CLOB_API = "https://clob.polymarket.com";

// Polymarket's CTF Exchange on Polygon (Neg Risk Exchange)
const NEG_RISK_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a" as Address;
// Polymarket standard exchange
const EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as Address;
// USDC (PoS) on Polygon
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as Address;
const USDC_DECIMALS = 6;

// Chain ID for Polygon (used in EIP-712 domain)
const POLYGON_CHAIN_ID = 137;

// Polymarket L2 key derivation message
const L2_KEY_MSG =
  "This message attests that I created an API key for Polymarket.";

interface L2ApiCreds {
  apiKey: string;
  secret: string;
  passphrase: string;
  address: Address;
}

// Module-level cache — derived once per process start
let cachedCreds: L2ApiCreds | null = null;

function buildHmacSignature(
  secret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body: string
): string {
  const message = `${timestamp}${method.toUpperCase()}${requestPath}${body}`;
  return createHmac("sha256", Buffer.from(secret, "base64"))
    .update(message)
    .digest("base64");
}

async function clobRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const creds = await getL2Creds();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body !== undefined ? JSON.stringify(body) : "";
  const sig = buildHmacSignature(creds.secret, timestamp, method, path, bodyStr);

  const res = await fetch(`${CLOB_API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "POLY_ADDRESS": creds.address,
      "POLY_SIGNATURE": sig,
      "POLY_TIMESTAMP": timestamp,
      "POLY_NONCE": "0",
      "POLY_API_KEY": creds.apiKey,
      "POLY_PASSPHRASE": creds.passphrase,
    },
    body: bodyStr || undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`CLOB ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Derive Polymarket L2 API credentials from the agent's private key.
 * The credentials are deterministic — same private key always produces the same
 * CLOB API key — so we derive once and cache.
 */
async function getL2Creds(): Promise<L2ApiCreds> {
  if (cachedCreds) return cachedCreds;

  const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) throw new Error("AGENT_PRIVATE_KEY not set");

  const account = privateKeyToAccount(privateKey);

  // Sign the fixed Polymarket L2 key derivation message (personal_sign)
  const sig = await signMessage({ message: L2_KEY_MSG, privateKey });

  // Derive API key, secret, passphrase from the signature bytes
  // Polymarket uses: apiKey=sig[0:36], secret=sig[36:68] (base64), passphrase=sig[68:100]
  const sigHex = sig.slice(2); // remove 0x
  const sigBytes = Buffer.from(sigHex, "hex");

  const apiKey = [
    sigBytes.slice(0, 4).toString("hex"),
    sigBytes.slice(4, 6).toString("hex"),
    sigBytes.slice(6, 8).toString("hex"),
    sigBytes.slice(8, 10).toString("hex"),
    sigBytes.slice(10, 16).toString("hex"),
  ].join("-");

  const secret = sigBytes.slice(16, 32).toString("base64");
  const passphrase = sigBytes.slice(32, 48).toString("base64");

  cachedCreds = {
    apiKey,
    secret,
    passphrase,
    address: account.address,
  };

  return cachedCreds;
}

export async function getAgentAddress(): Promise<Address> {
  const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) throw new Error("AGENT_PRIVATE_KEY not set");
  return privateKeyToAccount(privateKey).address;
}

// ── EIP-712 signed order ──────────────────────────────────────────────────────

interface SignedOrder {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: "BUY" | "SELL";
  signatureType: number;
  signature: string;
}

interface OrderbookSummary {
  asks: Array<{ price: string; size: string }>;
  bids: Array<{ price: string; size: string }>;
}

/**
 * Get the best ask price for buying a YES/NO token.
 */
async function getBestAskPrice(tokenId: string): Promise<number> {
  const book = await fetch(
    `${CLOB_API}/book?token_id=${encodeURIComponent(tokenId)}`,
    { headers: { Accept: "application/json" } }
  ).then((r) => r.json() as Promise<OrderbookSummary>);

  if (book.asks.length === 0) throw new Error("No liquidity for this token");
  return parseFloat(book.asks[0].price);
}

/**
 * Build and sign a market buy order for a Polymarket outcome token.
 *
 * We use the "FOK" (Fill-or-Kill) order type at the best ask price with 1%
 * slippage tolerance so the order fills immediately.
 */
async function buildSignedOrder(
  tokenId: string,
  amountUsdc: number,
  price: number
): Promise<SignedOrder> {
  const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  // Amounts in USDC cents (6 decimals)
  const makerAmount = parseUnits(amountUsdc.toFixed(6), USDC_DECIMALS).toString();
  // Shares = USDC spent / price
  const shares = amountUsdc / price;
  const takerAmount = parseUnits(shares.toFixed(6), 6).toString();

  const salt = Math.floor(Math.random() * 1e15).toString();
  const expiration = Math.floor(Date.now() / 1000 + 60 * 5).toString(); // 5 min

  // Polymarket EIP-712 order struct
  const orderData = {
    salt,
    maker: account.address,
    signer: account.address,
    taker: "0x0000000000000000000000000000000000000000",
    tokenId,
    makerAmount,
    takerAmount,
    expiration,
    nonce: "0",
    feeRateBps: "0",
    side: "BUY" as const,
    signatureType: 0,
  };

  // Sign via EIP-712 typed data
  const { signTypedData } = await import("viem/accounts");
  const signature = await signTypedData({
    privateKey,
    domain: {
      name: "Polymarket CTF Exchange",
      version: "1",
      chainId: POLYGON_CHAIN_ID,
      verifyingContract: EXCHANGE,
    },
    types: {
      Order: [
        { name: "salt", type: "uint256" },
        { name: "maker", type: "address" },
        { name: "signer", type: "address" },
        { name: "taker", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "makerAmount", type: "uint256" },
        { name: "takerAmount", type: "uint256" },
        { name: "expiration", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "feeRateBps", type: "uint256" },
        { name: "side", type: "uint8" },
        { name: "signatureType", type: "uint8" },
      ],
    },
    primaryType: "Order",
    message: {
      salt: BigInt(salt),
      maker: account.address,
      signer: account.address,
      taker: "0x0000000000000000000000000000000000000000" as Address,
      tokenId: BigInt(tokenId),
      makerAmount: BigInt(makerAmount),
      takerAmount: BigInt(takerAmount),
      expiration: BigInt(expiration),
      nonce: BigInt(0),
      feeRateBps: BigInt(0),
      side: 0, // BUY
      signatureType: 0,
    },
  });

  return { ...orderData, signature };
}

interface ClobOrderResponse {
  orderID: string;
  status: string;
  transactionsHashes?: string[];
}

/**
 * Place a market buy bet on Polymarket via the CLOB.
 */
export async function placeBet(order: BetOrder): Promise<BetResult> {
  const price = await getBestAskPrice(order.tokenId);

  // Add 2% slippage buffer
  const worstPrice = Math.min(price * 1.02, 0.99);
  const shares = order.amountUsdc / worstPrice;

  const signedOrder = await buildSignedOrder(
    order.tokenId,
    order.amountUsdc,
    worstPrice
  );

  const response = await clobRequest<ClobOrderResponse>("POST", "/order", {
    order: signedOrder,
    owner: signedOrder.maker,
    orderType: "FOK",
  });

  return {
    orderId: response.orderID,
    transactionHash: response.transactionsHashes?.[0],
    conditionId: order.conditionId,
    outcome: order.outcome,
    amountUsdc: order.amountUsdc,
    price,
    shares,
    maxPayout: shares,
  };
}

/**
 * Check the USDC balance of a wallet on Polygon.
 */
export async function getUsdcBalance(address: Address): Promise<number> {
  const client = createPublicClient({
    chain: polygon,
    transport: http(process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com"),
  });

  const raw = await client.readContract({
    address: USDC_ADDRESS,
    abi: [
      {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [address],
  });

  return Number(raw) / 10 ** USDC_DECIMALS;
}
