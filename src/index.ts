#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { config } from "dotenv";
import { z } from "zod";

config();

const gatewayURL = process.env.SPRAAY_GATEWAY_URL || "https://gateway.spraay.app";

async function createPaymentClient() {
  const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
  if (!evmPrivateKey) {
    throw new Error(
      "EVM_PRIVATE_KEY is required. Set it to a wallet with USDC on Base."
    );
  }
  const client = new x402Client();
  const account = privateKeyToAccount(evmPrivateKey);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });
  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });
  const signer = {
    ...walletClient,
    readContract: publicClient.readContract,
  } as any;
  registerExactEvmScheme(client, { signer });
  return wrapAxiosWithPayment(axios.create({ baseURL: gatewayURL }), client);
}

function registerTools(server: McpServer, api: any) {
  server.tool(
    "spraay_chat",
    "Send a message to 200+ AI models (GPT-4, Claude, Llama, Gemini, etc) via Spraay x402 Gateway. Costs $0.005 USDC per request. OpenAI-compatible.",
    {
      model: z.string().default("openai/gpt-4o-mini").describe("Model ID (e.g. openai/gpt-4o-mini, anthropic/claude-3.5-sonnet). Use spraay_models to list all."),
      messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() })).describe("Conversation messages in OpenAI format"),
      max_tokens: z.number().optional().describe("Max tokens to generate"),
      temperature: z.number().min(0).max(2).optional().describe("Sampling temperature (0-2)"),
    },
    async ({ model, messages, max_tokens, temperature }) => {
      const res = await api.post("/api/v1/chat/completions", {
        model, messages,
        ...(max_tokens && { max_tokens }),
        ...(temperature !== undefined && { temperature }),
      });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_models",
    "List all available AI models with pricing info. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/models");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_batch_execute",
    "Execute batch USDC payments to multiple recipients in one transaction on Base via Spraay. Returns encoded calldata. Costs $0.01 USDC.",
    {
      token: z.string().default("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").describe("ERC-20 token address on Base (default: USDC)"),
      recipients: z.array(z.string()).describe("Array of recipient wallet addresses"),
      amounts: z.array(z.string()).describe("Array of amounts in atomic units (e.g. '1000000' = 1 USDC)"),
      sender: z.string().describe("Sender wallet address (for approval tx encoding)"),
    },
    async ({ token, recipients, amounts, sender }) => {
      const res = await api.post("/api/v1/batch/execute", { token, recipients, amounts, sender });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_batch_estimate",
    "Estimate gas costs for a batch payment on Base. Costs $0.001 USDC.",
    {
      recipientCount: z.number().describe("Number of recipients in the batch"),
      token: z.string().optional().describe("Token address (optional, defaults to USDC)"),
    },
    async ({ recipientCount, token }) => {
      const res = await api.post("/api/v1/batch/estimate", { recipientCount, ...(token && { token }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_swap_quote",
    "Get optimal swap quotes via Uniswap V3 on Base. Tries all fee tiers + multi-hop through WETH. Costs $0.002 USDC.",
    {
      tokenIn: z.string().describe("Input token contract address on Base"),
      tokenOut: z.string().describe("Output token contract address on Base"),
      amountIn: z.string().describe("Input amount in atomic units (e.g. '1000000' = 1 USDC)"),
    },
    async ({ tokenIn, tokenOut, amountIn }) => {
      const res = await api.get("/api/v1/swap/quote", { params: { tokenIn, tokenOut, amountIn } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_tokens",
    "List supported tokens on Base with contract addresses, decimals, and symbols. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/swap/tokens");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_prices",
    "Get live onchain token prices in USD via Uniswap V3 on Base. Returns prices for 8+ major tokens (WETH, cbBTC, AERO, DEGEN, etc). Costs $0.002 USDC.",
    {
      token: z.string().optional().describe("Specific token symbol (e.g. WETH, cbBTC, AERO). Omit for all tokens."),
    },
    async ({ token }) => {
      const res = await api.get("/api/v1/prices", { params: token ? { token } : {} });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_balances",
    "Get ETH + ERC-20 token balances for any wallet address on Base. Checks 8+ popular tokens or custom list. Costs $0.002 USDC.",
    {
      address: z.string().describe("Wallet address to check balances for"),
      tokens: z.string().optional().describe("Comma-separated token contract addresses (optional)"),
      showAll: z.string().optional().describe("Set to 'true' to include zero balances"),
    },
    async ({ address, tokens, showAll }) => {
      const res = await api.get("/api/v1/balances", { params: { address, ...(tokens && { tokens }), ...(showAll && { showAll }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_resolve",
    "Resolve ENS names (.eth) and Basenames (.base.eth) to wallet addresses. Also supports reverse resolution. Costs $0.001 USDC.",
    {
      name: z.string().describe("ENS name (e.g. vitalik.eth), Basename (e.g. jesse.base.eth), or wallet address for reverse lookup"),
    },
    async ({ name }) => {
      const res = await api.get("/api/v1/resolve", { params: { name } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );
}

// Sandbox server for Smithery scanning (no real credentials needed)
export function createSandboxServer() {
  const server = new McpServer({
    name: "Spraay x402 Gateway",
    version: "1.0.0",
  });
  const mockApi = axios.create({ baseURL: gatewayURL });
  registerTools(server, mockApi);
  return server;
}

async function main() {
  const api = await createPaymentClient();
  const server = new McpServer({
    name: "Spraay x402 Gateway",
    version: "1.0.0",
  });
  registerTools(server, api);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.env.EVM_PRIVATE_KEY) {
  main().catch((error) => {
    console.error("Spraay MCP server error:", error);
    process.exit(1);
  });
}
