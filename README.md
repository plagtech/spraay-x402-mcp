# Spraay x402 MCP Server

**MCP server for [Spraay x402 Gateway](https://gateway.spraay.app) — connect Claude, Cursor, or any MCP-compatible AI to onchain DeFi, payments, payroll, invoicing, escrow, analytics & 200+ AI models on Base.**

AI agents pay USDC per request via x402 protocol. No API keys. No accounts. Just plug in and go.

## 29 Tools Available

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

### Data ($0.001–$0.002)
| Tool | Description | Cost |
|------|-------------|------|
| `spraay_prices` | Live token prices on Base | $0.002 |
| `spraay_balances` | ETH + ERC-20 balances for any wallet | $0.002 |
| `spraay_resolve` | ENS / Basename resolution | $0.001 |

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

### From Source

```bash
git clone https://github.com/plagtech/spraay-x402-mcp
cd spraay-x402-mcp
npm install
echo "EVM_PRIVATE_KEY=0xYOUR_KEY" > .env
npm start
```

## How It Works

1. AI agent calls a tool (e.g. `spraay_swap_quote`)
2. MCP server hits the Spraay x402 Gateway
3. Gateway returns `402 Payment Required` with USDC amount
4. `@x402/axios` auto-signs a USDC payment from your wallet
5. Gateway validates payment, returns data
6. Agent gets the response

All payments are micro-transactions ($0.001–$0.02) in USDC on Base.

## Requirements

- **Wallet**: EVM private key with USDC on Base (even $1 covers thousands of calls)
- **Node.js**: 18+
- **MCP Client**: Claude Desktop, Cursor, or any MCP-compatible client

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EVM_PRIVATE_KEY` | Yes | — | Wallet private key for USDC payments |
| `SPRAAY_GATEWAY_URL` | No | `https://gateway.spraay.app` | Gateway URL |

## Links

- **Gateway**: [gateway.spraay.app](https://gateway.spraay.app)
- **Discovery**: [gateway.spraay.app/.well-known/x402.json](https://gateway.spraay.app/.well-known/x402.json)
- **Spraay App**: [spraay.app](https://spraay.app)
- **GitHub**: [github.com/plagtech/spraay-x402-mcp](https://github.com/plagtech/spraay-x402-mcp)
- **x402 Protocol**: [x402.org](https://x402.org)

## License

MIT
