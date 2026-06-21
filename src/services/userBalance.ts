/**
 * Per-user USDC balance tracking in SQLite.
 *
 * Users deposit USDC to the agent's Polygon wallet. For MVP the balance is
 * manually credited via the /api/admin/credit endpoint (protected by a shared
 * secret). A background polling job can automate this by watching Polygon for
 * incoming transfers and crediting matching principal IDs.
 *
 * Amounts are stored as integer cents (USDC × 100) to avoid float rounding.
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const DB_PATH = path.join(DATA_DIR, "balances.db");

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS balances (
      principal_id TEXT PRIMARY KEY,
      usdc_cents   INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deposits (
      tx_hash      TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL,
      usdc_cents   INTEGER NOT NULL,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bets (
      order_id     TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL,
      condition_id TEXT NOT NULL,
      outcome      TEXT NOT NULL,
      usdc_cents   INTEGER NOT NULL,
      price        REAL NOT NULL,
      shares       REAL NOT NULL,
      status       TEXT NOT NULL DEFAULT 'open',
      created_at   TEXT NOT NULL
    );
  `);

  return _db;
}

/** Get the user's available USDC balance in dollars. */
export function getBalance(principalId: string): number {
  const row = db()
    .prepare("SELECT usdc_cents FROM balances WHERE principal_id = ?")
    .get(principalId) as { usdc_cents: number } | undefined;
  return (row?.usdc_cents ?? 0) / 100;
}

/** Deduct a USDC amount from the user's balance. Throws if insufficient. */
export function deductBalance(principalId: string, amountUsdc: number): void {
  const cents = Math.round(amountUsdc * 100);
  const result = db()
    .prepare(
      `UPDATE balances
         SET usdc_cents = usdc_cents - ?,
             updated_at = ?
       WHERE principal_id = ?
         AND usdc_cents >= ?`
    )
    .run(cents, new Date().toISOString(), principalId, cents);

  if (result.changes === 0) {
    throw new Error("Insufficient balance");
  }
}

/** Credit a USDC amount to the user's balance (e.g. on deposit or winnings). */
export function creditBalance(principalId: string, amountUsdc: number): void {
  const cents = Math.round(amountUsdc * 100);
  db()
    .prepare(
      `INSERT INTO balances (principal_id, usdc_cents, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(principal_id)
         DO UPDATE SET usdc_cents = usdc_cents + ?,
                       updated_at = ?`
    )
    .run(
      principalId,
      cents,
      new Date().toISOString(),
      cents,
      new Date().toISOString()
    );
}

/** Record a deposit (idempotent by tx_hash). Returns true if newly recorded. */
export function recordDeposit(
  principalId: string,
  txHash: string,
  amountUsdc: number
): boolean {
  const cents = Math.round(amountUsdc * 100);
  try {
    db()
      .prepare(
        `INSERT INTO deposits (tx_hash, principal_id, usdc_cents, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(txHash, principalId, cents, new Date().toISOString());

    creditBalance(principalId, amountUsdc);
    return true;
  } catch {
    return false; // already processed
  }
}

/** Record a placed bet for audit purposes. */
export function recordBet(
  principalId: string,
  orderId: string,
  conditionId: string,
  outcome: string,
  amountUsdc: number,
  price: number,
  shares: number
): void {
  db()
    .prepare(
      `INSERT INTO bets (order_id, principal_id, condition_id, outcome, usdc_cents, price, shares, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`
    )
    .run(
      orderId,
      principalId,
      conditionId,
      outcome,
      Math.round(amountUsdc * 100),
      price,
      shares,
      new Date().toISOString()
    );
}

/** List all open bets for a user (for future /positions command). */
export function getUserBets(
  principalId: string
): Array<{
  orderId: string;
  conditionId: string;
  outcome: string;
  amountUsdc: number;
  price: number;
  shares: number;
  status: string;
  createdAt: string;
}> {
  return (
    db()
      .prepare("SELECT * FROM bets WHERE principal_id = ? ORDER BY created_at DESC")
      .all(principalId) as Array<{
      order_id: string;
      condition_id: string;
      outcome: string;
      usdc_cents: number;
      price: number;
      shares: number;
      status: string;
      created_at: string;
    }>
  ).map((r) => ({
    orderId: r.order_id,
    conditionId: r.condition_id,
    outcome: r.outcome,
    amountUsdc: r.usdc_cents / 100,
    price: r.price,
    shares: r.shares,
    status: r.status,
    createdAt: r.created_at,
  }));
}
