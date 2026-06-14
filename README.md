<!--
  ============================================================================
  COUNTS — confirmed against the live gateway manifest on 2026-06-14.
  Source of truth: https://gateway.spraay.app/.well-known/x402.json

    Gateway:     153 endpoints  (129 paid + 24 free), 27 categories
    MCP server:  148 tools      (gateway minus the 5 agent-wallet endpoints)

  This README uses 148 because it documents the MCP server, which exposes a
  subset of gateway endpoints as tools. CONFIRM 148 before committing:

    npm run sync
    Select-String -Path src\auto-tools.ts -Pattern "server\.tool\(" | Measure-Object | % Count

  If that prints something other than 148, do one find-replace of "148" here.

  Keep this number in sync with: the GitHub repo Description, meta.json,
  smithery.yaml, and the cursor.directory listing. Gateway-level surfaces use
  153; MCP-server surfaces use 148.
  ============================================================================
-->

# 💧 Spraay x402 MCP Server

[![smithery badge](https://smithery.ai/badge/Plagtech/Spraay-x402-mcp)](https://smithery.ai/servers/Plagtech/Spraay-x402-mcp)
![Version](https://img.shields.io/badge/version-4.0.0-blue)
![Tools](https://img.shields.io/badge/tools-148-blueviolet)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Full-stack DeFi infrastructure for AI agents — 148 pay-per-call tools, backed by the 153-endpoint Spraay x402 Gateway on Base, with Solana, Ethereum, XRP, and Stellar payment rails.**

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

Two ways to connect, depending on how payments are authorized. **Read
[Security & Wallet Safety](#security--wallet-safety) before the local path —
these tools can move real funds.**

### Option 1 — Remote URL (recommended, no private key on your machine)

Settlement is handled gateway-side; your client never holds a signing key.

**Cursor** (`.cursor/mcp.json`) or **Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "spraay": {
      "url": "https://spraay-x402-mcp--plagtech.run.tools"
    }
  }
}
```

### Option 2 — Local, self-signed (advanced)

Run the server locally and let it sign USDC payments from a wallet you control.
Use the **scoped, version-pinned** package.

```jsonc
{
  "mcpServers": {
    "spraay": {
      "command": "npx",
      "args": ["-y", "@plagtech/spraay-x402-mcp@4.0.0"],
      "env": {
        "EVM_PRIVATE_KEY": "${EVM_PRIVATE_KEY}",
        "SPRAAY_ENABLE_PAYMENTS": "true"
        // Optional autonomy leash — add these ONLY when running an
        // unsupervised agent. Leave them out for interactive/human use
        // (no limit). See Security & Wallet Safety below.
        // "SPRAAY_MAX_SPEND_USDC": "1.00",
        // "SPRAAY_DAILY_CAP_USDC": "10.00"
      }
    }
  }
}
```

Set `EVM_PRIVATE_KEY` in your shell environment — **never paste a raw key into
this file.** Use a dedicated hot wallet funded only with what the agent may
spend. See [Security & Wallet Safety](#security--wallet-safety).

### Smithery

```bash
smithery mcp add Plagtech/Spraay-x402-mcp
```

### From source

```bash
git clone https://github.com/plagtech/spraay-x402-mcp
cd spraay-x402-mcp
npm install
cp .env.example .env          # then edit .env with your key (it is gitignored)
npm run build
npm start
```

---

## Tool catalog

148 tools spanning the gateway's 27 categories. Highlights by area:

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
   **Local mode:** `@x402/axios` signs a USDC micropayment from your wallet,
   subject to the spend caps you set.
5. The gateway validates payment and returns the data.

---

## Security & Wallet Safety

These tools can initiate **real USDC payments**. Treat the server like any tool
with funds access.

- **Prefer Option 1 (remote URL)** — no signing key on your machine.
- If you self-sign (Option 2): use a **dedicated hot wallet**, funded only with
  what you'll let the agent spend. Never a key that controls other assets.
- **Payments are off by default.** `SPRAAY_ENABLE_PAYMENTS` must be `true` before
  any fund-moving tool will run. A fresh install cannot spend until you opt in.
  Read-only tools work regardless.
- **Spend caps are optional — an autonomy leash for unattended agents.** When you
  run an agent with no human watching, set `SPRAAY_MAX_SPEND_USDC` (per call) and
  `SPRAAY_DAILY_CAP_USDC` to bound the blast radius if it loops or is manipulated
  by upstream prompt injection. **Leave them unset for interactive use** — a human
  at the keyboard is the supervision, and there's no limit unless you add one.
- **Never** put a raw private key in a config file, issue, or any committed file.
  Keys live in a gitignored `.env` or your shell environment only.

The published npm package ships only `dist/`, `README`, and `LICENSE` (verify
with `npm pack --dry-run`) — no binaries, no build tooling, no install scripts.

Report security issues to **security@spraay.app**, not a public issue.

---

## Requirements

- **Node.js** 20+
- **MCP client** — Claude Desktop, Cursor, or any MCP-compatible client
- **Wallet** (local mode only) — an EVM key with USDC on Base; even $1 covers
  thousands of calls

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `EVM_PRIVATE_KEY` | Local mode only | — | Wallet key for USDC signing. Use a dedicated, capped hot wallet. |
| `SPRAAY_ENABLE_PAYMENTS` | No | `false` | Master gate. Must be `true` to allow any fund-moving tool. Off = read-only. |
| `SPRAAY_MAX_SPEND_USDC` | No | unset = no limit | Optional per-call ceiling. Set only for unattended agents. |
| `SPRAAY_DAILY_CAP_USDC` | No | unset = no limit | Optional rolling 24h ceiling. Set only for unattended agents. |
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
