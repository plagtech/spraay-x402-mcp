<!--
  ============================================================================
  COUNTS — confirmed against the live gateway manifest on 2026-06-30.
  Source of truth: https://gateway.spraay.app/.well-known/x402.json

    Gateway:     174 endpoints  (143 paid + 31 free), 27 categories
    MCP server:  169 tools      (gateway minus the 5 agent-wallet endpoints)

  This README uses 169 because it documents the MCP server, which exposes a
  subset of gateway endpoints as tools. CONFIRM 169 before committing:

    npm run sync
    Select-String -Path src\auto-tools.ts -Pattern "server\.tool\(" | Measure-Object | % Count

  If that prints something other than 169, do one find-replace of "169" here.

  Keep this number in sync with: the GitHub repo Description, meta.json,
  smithery.yaml, and the cursor.directory listing. Gateway-level surfaces use
  174; MCP-server surfaces use 169.
  ============================================================================
-->

# 💧 Spraay x402 MCP Server

[![smithery badge](https://smithery.ai/badge/Plagtech/Spraay-x402-mcp)](https://smithery.ai/servers/Plagtech/Spraay-x402-mcp)
![Version](https://img.shields.io/badge/version-4.2.0-blue)
![Tools](https://img.shields.io/badge/tools-169-blueviolet)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Full-stack DeFi infrastructure for AI agents — 169 pay-per-call tools, backed by the 174-endpoint Spraay x402 Gateway on Base, with Solana, Ethereum, XRP, and Stellar payment rails.**

Connect Claude, Cursor, or any MCP client to onchain payments, batch payouts,
swaps, bridging, payroll, invoicing, escrow, oracle data, analytics, 200+ AI
models, GPU/compute, research APIs, search/RAG, and more. Agents pay USDC per
request via the [x402 protocol](https://x402.org) — no API keys, no accounts.

> The tool list is generated from the live gateway manifest at build time
> (`npm run sync`), so the authoritative catalog and pricing always live at the
> gateway — see [Tool catalog](#tool-catalog). 24 of the gateway's endpoints are
> **free** (no payment required).

---

## Quick Start

Install and go — **no config, no API keys, no env vars.** On first run the
server auto-creates a wallet, saves it to `~/.spraay/.session`, and prints the
address to stderr. Fund that address with USDC on Base and start calling tools.

**Read [Security & Wallet Safety](#security--wallet-safety) — these tools move
real funds.**

### One-line install (Claude Code)

```bash
claude mcp add spraay -s user -- npx -y spraay-x402-mcp
```

### Manual config (Cursor / Claude Desktop)

**Cursor** (`.cursor/mcp.json`) or **Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "spraay": {
      "command": "npx",
      "args": ["-y", "spraay-x402-mcp"]
    }
  }
}
```

That's it. The first run prints something like:

```
💧 Spraay created a new wallet: 0xABC…123
   Private key saved to ~/.spraay/.session (keep it safe — it controls funds).
   Fund this address with USDC on Base to start paying for tool calls.
```

#### Optional — bring your own wallet

To sign with a key you already control instead of the auto-created one, set
`EVM_PRIVATE_KEY` in your environment (it overrides the session wallet).
**Never paste a raw key into a committed config file** — use a dedicated hot
wallet funded only with what the agent may spend. See
[Security & Wallet Safety](#security--wallet-safety).

### Remote URL (no wallet on your machine)

Settlement is handled gateway-side; your client never holds a signing key.

```json
{
  "mcpServers": {
    "spraay": {
      "url": "https://spraay-x402-mcp--plagtech.run.tools"
    }
  }
}
```

### Smithery

```bash
smithery mcp add Plagtech/Spraay-x402-mcp
```

### From source

```bash
git clone https://github.com/plagtech/spraay-x402-mcp
cd spraay-x402-mcp
npm install
npm run build
npm start                     # auto-creates a wallet on first run
```

---

## Tool catalog

169 tools spanning the gateway's 27 categories. Highlights by area:

| Area | What it covers |
| --- | --- |
| **AI & Inference** | 200+ LLMs (OpenAI-compatible), wallet/tx classification, contract explanation, summaries |
| **Compute** | Text / image / video / TTS / STT / embeddings across Replicate, Chutes, OpenRouter; batch jobs |
| **Compute Futures** | Prepaid compute credits with tier discounts; draw down per inference |
| **Bittensor** | Decentralized inference, image gen, and embeddings via SN64 / SN19 |
| **Payments** | Batch payouts up to 200 recipients (Base, XRP Ledger, Stellar); estimates |
| **Payroll** | Stablecoin payroll runs across Base, Ethereum, Solana |
| **Invoicing & Escrow** | Crypto-native invoices and milestone escrow (persistent) |
| **DeFi & Data** | Swaps (Uniswap V3 / Aerodrome), oracle prices/gas/FX, bridge quotes, balances, ENS/Basename |
| **Analytics** | Wallet profiles and decoded transaction history |
| **Research** | 250M+ papers (OpenAlex), arXiv, Crossref, PubMed, PubChem, US Census, dictionary |
| **Search & RAG** | Web search, content extraction, question answering |
| **Communication** | Email, SMS, XMTP messaging, webhooks |
| **Infrastructure** | Multi-chain RPC, IPFS/Arweave storage, cron scheduling, structured logs |
| **Identity & Compliance** | KYC/sanctions screening, auth sessions, audit trail, crypto tax (FIFO, IRS 8949) |
| **Supply Chain (SCTP)** | Supplier registration, purchase orders, invoice verification, settlement |
| **Robotics (RTP)** | Register robots, dispatch paid tasks, escrow-backed completion |
| **Trust & Safety** | ProofLayer trust scores; free token-safety, address-safety, and tx-decode checks |

**24 free endpoints** require no payment — gas/prices/chain-status, address &
batch validation, ENS resolution, unit conversion, x402 discovery probes, and
model/compute discovery.

For the exact, current tool list and per-tool pricing, query the live manifest:

```bash
curl https://gateway.spraay.app/.well-known/x402.json
```

Pricing ranges from $0.001 (reads) to ~$0.10 (payroll, escrow release, tax),
settled in USDC on Base.

---

## How it works

1. An agent calls a tool (e.g. `spraay_batch_execute`).
2. The MCP server hits the [Spraay x402 Gateway](https://gateway.spraay.app).
3. The gateway responds `402 Payment Required` with a USDC amount.
4. **Remote mode:** settlement is handled gateway-side.
   **Local mode:** `@x402/axios` signs a USDC micropayment from the auto-created
   (or overridden) wallet.
5. The gateway validates payment and returns the data.

---

## Security & Wallet Safety

These tools can initiate **real USDC payments**. Treat the server like any tool
with funds access.

- **The auto-created wallet only holds what you send it.** Fund it with only as
  much USDC as you're willing to let the agent spend. It starts empty, so a fresh
  install cannot move funds until you fund it; read-only tools work regardless.
- **The session key lives at `~/.spraay/.session`.** Protect that file like any
  secret — anyone who reads it controls the wallet. It's written with `0600`
  permissions on POSIX systems. Back it up if the funds matter; delete it to
  rotate to a new wallet on the next run.
- **Prefer the remote URL** if you'd rather keep no signing key on your machine —
  settlement is handled gateway-side.
- If you bring your own key via `EVM_PRIVATE_KEY`, use a **dedicated hot wallet**
  that controls no other assets, and **never** put a raw private key in a config
  file, issue, or any committed file — keep it in your shell environment only.

The published npm package ships only `dist/`, `README`, and `LICENSE` (verify
with `npm pack --dry-run`) — no binaries, no build tooling, no install scripts.

Report security issues to **security@spraay.app**, not a public issue.

---

## Requirements

- **Node.js** 20+
- **MCP client** — Claude Desktop, Cursor, or any MCP-compatible client
- **USDC on Base** — fund the auto-created wallet (or your own); even $1 covers
  thousands of calls

## Environment variables

None are required — the server runs with zero configuration. All of the
following are optional overrides.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `EVM_PRIVATE_KEY` | No | auto-created at `~/.spraay/.session` | Override the auto-created wallet with your own key. Use a dedicated, funded-as-needed hot wallet. |
| `SPRAAY_GATEWAY_URL` | No | `https://gateway.spraay.app` | Override the gateway URL. |

---

## Links

- **MCP server:** [mcp.spraay.app](https://mcp.spraay.app)
- **Gateway:** [gateway.spraay.app](https://gateway.spraay.app)
- **Manifest:** [gateway.spraay.app/.well-known/x402.json](https://gateway.spraay.app/.well-known/x402.json)
- **Smithery:** [smithery.ai/servers/Plagtech/Spraay-x402-mcp](https://smithery.ai/servers/Plagtech/Spraay-x402-mcp)
- **x402:** [x402.org](https://x402.org)

## License

MIT
