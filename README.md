# Spraay x402 MCP Server

**MCP server for [Spraay x402 Gateway](https://gateway.spraay.app) — connect Claude, Cursor, or any MCP-compatible AI to onchain data, AI models, and batch payments on Base.**

AI agents pay USDC per request. No API keys. No accounts. Just plug in and go.

## 9 Tools Available

| Tool | Cost | What It Does |
|------|------|--------------|
| `spraay_chat` | $0.005 | AI chat via 200+ models (GPT-4, Claude, Llama, Gemini) |
| `spraay_models` | $0.001 | List available AI models with pricing |
| `spraay_batch_execute` | $0.01 | Batch USDC payments to multiple recipients |
| `spraay_batch_estimate` | $0.001 | Estimate gas for batch payments |
| `spraay_swap_quote` | $0.002 | Uniswap V3 swap quotes on Base |
| `spraay_tokens` | $0.001 | List supported tokens on Base |
| `spraay_prices` | $0.002 | Live onchain token prices (Uniswap V3) |
| `spraay_balances` | $0.002 | ETH + ERC-20 balances for any address |
| `spraay_resolve` | $0.001 | Resolve ENS names and Basenames to addresses |

## Quick Start

### 1. Clone and Install
```bash
git clone https://github.com/plagtech/spraay-x402-mcp.git
cd spraay-x402-mcp
npm install
npm run build
```

### 2. Configure Claude Desktop

Add to your Claude Desktop config:
```json
{
  "mcpServers": {
    "spraay": {
      "command": "node",
      "args": ["/absolute/path/to/spraay-x402-mcp/dist/index.js"],
      "env": {
        "EVM_PRIVATE_KEY": "0xYourPrivateKeyWithUSDCOnBase"
      }
    }
  }
}
```

### 3. Configure Cursor

Add to `.cursor/mcp.json` in your project:
```json
{
  "mcpServers": {
    "spraay": {
      "command": "node",
      "args": ["/absolute/path/to/spraay-x402-mcp/dist/index.js"],
      "env": {
        "EVM_PRIVATE_KEY": "0xYourPrivateKeyWithUSDCOnBase"
      }
    }
  }
}
```

### 4. Restart and Use

Restart Claude Desktop or Cursor. Then just ask:

- "What is the current price of ETH on Base?" -> calls spraay_prices
- "Check the USDC balance of vitalik.eth" -> calls spraay_resolve then spraay_balances
- "Get me a swap quote for 100 USDC to WETH" -> calls spraay_swap_quote
- "Send 10 USDC each to these 5 addresses" -> calls spraay_batch_execute

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| EVM_PRIVATE_KEY | Yes | Private key of a wallet with USDC on Base mainnet |
| SPRAAY_GATEWAY_URL | No | Gateway URL (default: https://gateway.spraay.app) |

## How Payments Work
```
You ask Claude -> Claude calls spraay_prices tool
                        |
            MCP server hits gateway.spraay.app/api/v1/prices
                        |
            Gateway returns HTTP 402 + payment requirements
                        |
            x402 client auto-signs $0.002 USDC payment
                        |
            Retries request with payment proof
                        |
            Gateway verifies payment, returns live prices
                        |
            Claude shows you the data
```

Your wallet pays USDC on Base for each tool call. Payments are instant and verifiable onchain.

## Related

- [Spraay x402 Gateway](https://gateway.spraay.app) — the API this MCP server connects to
- [x402 Protocol](https://x402.org) — the payment standard
- [Spraay](https://spraay.app) — multi-chain batch payment protocol
- [MangoSwap](https://mangoswap.xyz) — DEX on Base

## License

MIT

Built by @lostpoet | Base Builder | 2026
