# Spraay x402 MCP Server

[![smithery badge](https://smithery.ai/badge/Plagtech/Spraay-x402-mcp)](https://smithery.ai/servers/Plagtech/Spraay-x402-mcp)
[![Version](https://img.shields.io/badge/version-3.2.0-blue)](https://mcp.spraay.app)
[![Tools](https://img.shields.io/badge/tools-57%20(56%20active)-blueviolet)](https://mcp.spraay.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Full-stack DeFi infrastructure for AI agents — 57 pay-per-use tools (56 active) on Base with persistent Supabase storage.**

Connect Claude, Cursor, or any MCP-compatible AI to onchain payments, token swaps, bridge, payroll, invoicing, escrow, oracle data, analytics, AI inference, email, XMTP messaging, webhooks, cron scheduling, IPFS storage, multi-chain RPC, KYC, auth, audit trail, tax & 200+ AI models.

AI agents pay USDC per request via [x402 protocol](https://x402.org). No API keys. No accounts. Just plug in and go.

---

## Quick Start

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "spraay": {
      "command": "npx",
      "args": ["-y", "spraay-x402-mcp"],
      "env": {
        "EVM_PRIVATE_KEY": "0xYOUR_PRIVATE_KEY"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "spraay": {
      "command": "npx",
      "args": ["-y", "spraay-x402-mcp"],
      "env": {
        "EVM_PRIVATE_KEY": "0xYOUR_PRIVATE_KEY"
      }
    }
  }
}
```

### Smithery

```bash
smithery mcp add Plagtech/Spraay-x402-mcp
```

### From Source

```bash
git clone https://github.com/plagtech/spraay-x402-mcp
cd spraay-x402-mcp
npm install
echo "EVM_PRIVATE_KEY=0xYOUR_KEY" > .env
npm start
```

---

## Hosted deployment

A hosted deployment is available on [Fronteir AI](https://fronteir.ai/mcp/plagtech-spraay-x402-mcp).

## 57 Tools — 15 Categories

### AI ($0.001–$0.005)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_chat` | Chat with 200+ AI models (GPT-4, Claude, Llama, Gemini) | $0.005 |
| `spraay_models` | List all available models | $0.001 |

### Payments ($0.001–$0.01)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_batch_execute` | Batch pay up to 200 recipients in one tx | $0.01 |
| `spraay_batch_estimate` | Estimate gas for batch payment | $0.001 |

### DeFi — Swap ($0.001–$0.01)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_swap_quote` | Get Uniswap V3 swap quote | $0.002 |
| `spraay_swap_tokens` | List supported swap tokens | $0.001 |
| `spraay_swap_execute` | Execute swap (unsigned tx) | $0.01 |

### Oracle ($0.001–$0.003)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_oracle_prices` | On-chain token prices with confidence scores | $0.003 |
| `spraay_oracle_gas` | Gas prices on Base | $0.001 |
| `spraay_oracle_fx` | Stablecoin FX rates with depeg detection | $0.002 |

### Bridge ($0.001–$0.005)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_bridge_quote` | Cross-chain bridge quote (8+ chains) | $0.005 |
| `spraay_bridge_chains` | Supported bridge chains | $0.001 |

### Payroll ($0.001–$0.02)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_payroll_execute` | Pay up to 200 employees in stablecoins | $0.02 |
| `spraay_payroll_estimate` | Estimate payroll gas and fees | $0.002 |
| `spraay_payroll_tokens` | List payroll stablecoins | $0.001 |

### Invoice ($0.001–$0.005) — persistent
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_invoice_create` | Create invoice with payment tx | $0.005 |
| `spraay_invoice_list` | List invoices by address | $0.002 |
| `spraay_invoice_get` | Look up invoice by ID | $0.001 |

### Analytics ($0.003–$0.005)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_analytics_wallet` | Wallet profile: balances, age, classification | $0.005 |
| `spraay_analytics_txhistory` | Transaction history with decoded types | $0.003 |

### Escrow ($0.001–$0.008) — persistent
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_escrow_create` | Create conditional escrow with milestones | $0.008 |
| `spraay_escrow_list` | List escrows by address | $0.002 |
| `spraay_escrow_get` | Escrow status and details | $0.001 |
| `spraay_escrow_fund` | Mark escrow as funded | $0.002 |
| `spraay_escrow_release` | Release funds to beneficiary | $0.005 |
| `spraay_escrow_cancel` | Cancel escrow | $0.002 |

### AI Inference ($0.008–$0.01)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_classify_address` | AI wallet classification with risk scoring | $0.008 |
| `spraay_classify_tx` | AI transaction classification and risk analysis | $0.008 |
| `spraay_explain_contract` | AI smart contract analysis and explanation | $0.01 |
| `spraay_summarize` | AI intelligence briefing for any address or tx | $0.008 |

### Communication ($0.001–$0.005)
| Tool | Description | Cost | Status |
|------|-------------|------|--------|
| `spraay_notify_email` | Send email notifications (AgentMail) | $0.003 | ✅ Live |
| `spraay_notify_sms` | Send SMS notifications | $0.005 | ⏳ Simulated |
| `spraay_notify_status` | Check notification delivery status | $0.001 | ✅ Live |
| `spraay_webhook_register` | Register webhook endpoint | $0.003 | ✅ Persistent |
| `spraay_webhook_test` | Test webhook delivery | $0.002 | ✅ Persistent |
| `spraay_webhook_list` | List registered webhooks | $0.001 | ✅ Persistent |
| `spraay_webhook_delete` | Delete webhook | $0.001 | ✅ Persistent |
| `spraay_xmtp_send` | Send encrypted XMTP message | $0.003 | ✅ Live |
| `spraay_xmtp_inbox` | Read XMTP inbox | $0.002 | ✅ Live |

### Infrastructure ($0.001–$0.005)
| Tool | Description | Cost | Status |
|------|-------------|------|--------|
| `spraay_rpc_call` | Multi-chain JSON-RPC via Alchemy | $0.001 | ✅ Live |
| `spraay_rpc_chains` | List supported RPC chains | $0.001 | ✅ Live |
| `spraay_storage_pin` | Pin to IPFS via Pinata | $0.005 | ✅ Live |
| `spraay_storage_get` | Retrieve pinned content | $0.002 | ✅ Live |
| `spraay_storage_status` | Check pin status | $0.001 | ✅ Live |
| `spraay_cron_create` | Create scheduled job | $0.005 | ✅ Persistent |
| `spraay_cron_list` | List scheduled jobs | $0.001 | ✅ Persistent |
| `spraay_cron_cancel` | Cancel scheduled job | $0.001 | ✅ Persistent |
| `spraay_logs_ingest` | Ingest structured logs | $0.001 | ✅ Persistent |
| `spraay_logs_query` | Query logs | $0.003 | ✅ Persistent |

### Identity & Access ($0.001–$0.05) — persistent
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_kyc_verify` | Initiate KYC/KYB verification | $0.05 |
| `spraay_kyc_status` | Check KYC status | $0.005 |
| `spraay_auth_session` | Create scoped auth session | $0.005 |
| `spraay_auth_verify` | Verify session token | $0.001 |

### Compliance ($0.001–$0.02) — persistent
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_audit_log` | Record audit trail entry | $0.001 |
| `spraay_audit_query` | Query audit trail | $0.005 |
| `spraay_tax_calculate` | Calculate crypto tax (FIFO) | $0.01 |
| `spraay_tax_report` | Retrieve tax report | $0.02 |

### Data ($0.001–$0.002)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_prices` | Live token prices on Base | $0.002 |
| `spraay_balances` | ETH + ERC-20 balances for any wallet | $0.002 |
| `spraay_resolve` | ENS / Basename resolution | $0.001 |

---

## How It Works

1. AI agent calls a tool (e.g. `spraay_batch_execute`)
2. MCP server hits the [Spraay x402 Gateway](https://gateway.spraay.app)
3. Gateway returns `402 Payment Required` with USDC amount
4. `@x402/axios` auto-signs a USDC micropayment from your wallet
5. Gateway validates payment and returns data
6. Agent gets the response

All payments are micro-transactions ($0.001–$0.05) in USDC on Base mainnet.

---

## Requirements

- **Wallet**: EVM private key with USDC on Base (even $1 covers thousands of calls)
- **Node.js**: 18+
- **MCP Client**: Claude Desktop, Cursor, or any MCP-compatible client

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EVM_PRIVATE_KEY` | Yes | — | Wallet private key for USDC payments |
| `SPRAAY_GATEWAY_URL` | No | `https://gateway.spraay.app` | Override gateway URL |

---

## Links

- **MCP Server**: [mcp.spraay.app](https://mcp.spraay.app)
- **Gateway**: [gateway.spraay.app](https://gateway.spraay.app)
- **Bazaar Discovery**: [gateway.spraay.app/.well-known/x402.json](https://gateway.spraay.app/.well-known/x402.json)
- **Spraay App**: [spraay.app](https://spraay.app)
- **Smithery**: [smithery.ai/servers/Plagtech/Spraay-x402-mcp](https://smithery.ai/servers/Plagtech/Spraay-x402-mcp)
- **x402 Protocol**: [x402.org](https://x402.org)

## License

MIT
