# Spraay x402 MCP Server

[![smithery badge](https://smithery.ai/badge/Plagtech/Spraay-x402-mcp)](https://smithery.ai/servers/Plagtech/Spraay-x402-mcp)
[![npm version](https://img.shields.io/npm/v/@plagtech/spraay-x402-mcp)](https://www.npmjs.com/package/@plagtech/spraay-x402-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Full-stack DeFi infrastructure for AI agents — 57 pay-per-use tools on Base.**

Connect Claude, Cursor, or any MCP-compatible AI to onchain payments, token swaps, bridge, payroll, invoicing, escrow, oracle data, analytics, AI inference, webhooks, XMTP messaging, scheduling, IPFS storage, KYC, auth, audit trail, tax, and 200+ AI models.

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
      "args": ["-y", "@plagtech/spraay-x402-mcp"],
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
      "args": ["-y", "@plagtech/spraay-x402-mcp"],
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

## 57 Tools Available

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
| `spraay_bridge_quote` | Cross-chain bridge quote (8 chains) | $0.005 |
| `spraay_bridge_chains` | Supported bridge chains | $0.001 |

### Payroll ($0.001–$0.02)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_payroll_execute` | Pay up to 200 employees in stablecoins | $0.02 |
| `spraay_payroll_estimate` | Estimate payroll gas and fees | $0.002 |
| `spraay_payroll_tokens` | List payroll stablecoins | $0.001 |

### Invoice ($0.001–$0.005)
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

### Escrow ($0.001–$0.008)
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
| `spraay_inference_classify_address` | AI wallet classification with risk scoring | $0.008 |
| `spraay_inference_classify_tx` | AI transaction classification and risk analysis | $0.008 |
| `spraay_inference_explain_contract` | AI smart contract analysis and explanation | $0.01 |
| `spraay_inference_summarize` | AI intelligence briefing for any address or tx | $0.008 |

### Webhooks ($0.001–$0.005)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_webhook_create` | Register webhook for onchain events | $0.005 |
| `spraay_webhook_list` | List active webhooks | $0.001 |
| `spraay_webhook_delete` | Remove a webhook | $0.001 |

### XMTP Messaging ($0.001–$0.005)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_xmtp_send` | Send encrypted message to any wallet address | $0.005 |
| `spraay_xmtp_inbox` | Read messages from XMTP inbox | $0.002 |
| `spraay_xmtp_broadcast` | Broadcast message to multiple addresses | $0.005 |

### Scheduler / Cron ($0.001–$0.005)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_schedule_create` | Schedule recurring onchain payments | $0.005 |
| `spraay_schedule_list` | List scheduled jobs | $0.001 |
| `spraay_schedule_cancel` | Cancel a scheduled job | $0.001 |

### IPFS / Storage ($0.002–$0.01)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_ipfs_pin` | Pin file or JSON to IPFS | $0.01 |
| `spraay_ipfs_get` | Fetch content from IPFS | $0.002 |
| `spraay_storage_arweave` | Permanent storage on Arweave | $0.01 |

### KYC / Identity ($0.005–$0.02)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_kyc_verify` | On-demand wallet KYC/KYB check | $0.02 |
| `spraay_kyc_status` | Check verification status | $0.005 |

### Auth ($0.001–$0.005)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_auth_session` | Create pay-per-session auth token | $0.005 |
| `spraay_auth_verify` | Verify session token | $0.001 |

### Audit Trail ($0.002–$0.005)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_audit_log` | Write immutable audit entry | $0.005 |
| `spraay_audit_query` | Query audit trail by address or date | $0.002 |

### Tax ($0.005–$0.01)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_tax_calculate` | Calculate crypto tax liability for address | $0.01 |
| `spraay_tax_report` | Generate tax report (CSV/JSON) | $0.01 |
| `spraay_tax_cost_basis` | Cost basis lookup for token lots | $0.005 |

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

All payments are micro-transactions ($0.001–$0.02) in USDC on Base mainnet.

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
- **npm**: [@plagtech/spraay-x402-mcp](https://www.npmjs.com/package/@plagtech/spraay-x402-mcp)
- **x402 Protocol**: [x402.org](https://x402.org)

## License

MIT
