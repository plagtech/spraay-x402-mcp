// Wallet resolution for the Spraay MCP server.
//
// Goal: zero-config UX. The user installs the server and starts calling tools;
// they only have to *fund* the wallet, never configure a key. Resolution order:
//
//   1. EVM_PRIVATE_KEY env var  — explicit override, always wins.
//   2. ~/.spraay/.session       — a key persisted from a previous run.
//   3. (first run) generate a fresh key, persist it, and use it.
//
// The key is written to ~/.spraay/.session with 0600 perms. The address (never
// the key) is logged to stderr so the user knows where to send USDC on Base.

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const SESSION_DIR = join(homedir(), ".spraay");
export const SESSION_FILE = join(SESSION_DIR, ".session");

export interface WalletInfo {
  privateKey: `0x${string}`;
  address: string;
  source: "env" | "session" | "generated";
}

function isValidKey(k: string | undefined | null): k is string {
  return !!k && /^0x[0-9a-fA-F]{64}$/.test(k.trim());
}

/**
 * Resolve the wallet to sign x402 payments with, creating and persisting one on
 * first run. Never throws — falls back to an ephemeral in-memory key if the
 * session file cannot be written.
 */
export function resolveWallet(): WalletInfo {
  // 1. Explicit override always wins.
  const envKey = process.env.EVM_PRIVATE_KEY;
  if (isValidKey(envKey)) {
    const pk = envKey.trim() as `0x${string}`;
    return { privateKey: pk, address: privateKeyToAccount(pk).address, source: "env" };
  }

  // 2. Reuse a persisted session key if present and valid.
  try {
    if (existsSync(SESSION_FILE)) {
      const saved = readFileSync(SESSION_FILE, "utf-8").trim();
      if (isValidKey(saved)) {
        const pk = saved as `0x${string}`;
        return { privateKey: pk, address: privateKeyToAccount(pk).address, source: "session" };
      }
    }
  } catch {
    // Unreadable/corrupt session file — fall through and mint a new one.
  }

  // 3. First run: generate, persist, return.
  const pk = generatePrivateKey();
  try {
    mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(SESSION_FILE, pk, { mode: 0o600 });
    try { chmodSync(SESSION_FILE, 0o600); } catch { /* best-effort on non-POSIX */ }
  } catch (e: any) {
    console.error(
      `⚠️  Could not persist wallet to ${SESSION_FILE}: ${e?.message ?? e}. ` +
      `Using an ephemeral key for this session only.`
    );
  }
  return { privateKey: pk, address: privateKeyToAccount(pk).address, source: "generated" };
}

/** Log the resolved wallet address (never the key) to stderr. */
export function logWallet(w: WalletInfo): void {
  if (w.source === "env") {
    console.error(`💧 Spraay wallet (EVM_PRIVATE_KEY override): ${w.address}`);
  } else if (w.source === "session") {
    console.error(`💧 Spraay wallet (${SESSION_FILE}): ${w.address}`);
  } else {
    console.error(`💧 Spraay created a new wallet: ${w.address}`);
    console.error(`   Private key saved to ${SESSION_FILE} (keep it safe — it controls funds).`);
    console.error(`   Fund this address with USDC on Base to start paying for tool calls.`);
  }
}
