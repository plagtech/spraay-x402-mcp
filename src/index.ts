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

  // ============================================
  // AI (2 tools)
  // ============================================

  server.tool(
    "spraay_chat",
    "Send a message to 200+ AI models (GPT-4, Claude, Llama, Gemini, etc) via Spraay x402 Gateway. Costs $0.005 USDC per request. OpenAI-compatible.",
    {
      model: z.string().default("openai/gpt-4o-mini").describe("Model ID (e.g. openai/gpt-4o-mini, anthropic/claude-3.5-sonnet). Use spraay_models to list all."),
      message: z.string().describe("User message to send"),
      systemPrompt: z.string().optional().describe("Optional system prompt"),
    },
    async ({ model, message, systemPrompt }) => {
      const messages: any[] = [];
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      messages.push({ role: "user", content: message });
      const res = await api.post("/api/v1/chat/completions", { model, messages });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_models",
    "List all available AI models on the Spraay x402 Gateway. Returns 200+ models with pricing. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/models");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // PAYMENTS (2 tools)
  // ============================================

  server.tool(
    "spraay_batch_execute",
    "Execute batch payments to multiple recipients via Spraay V2 contract on Base. Supports any ERC-20 token + ETH. Returns unsigned transactions for user signing. Costs $0.01 USDC.",
    {
      token: z.string().describe("Token symbol (USDC, USDT, DAI, WETH) or contract address"),
      recipients: z.array(z.string()).describe("Array of recipient wallet addresses"),
      amounts: z.array(z.string()).describe("Array of amounts in raw units (matching recipients)"),
      sender: z.string().describe("Sender wallet address"),
    },
    async ({ token, recipients, amounts, sender }) => {
      const res = await api.post("/api/v1/batch/execute", { token, recipients, amounts, sender });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_batch_estimate",
    "Estimate gas cost for a batch payment. Costs $0.001 USDC.",
    {
      recipientCount: z.number().describe("Number of recipients in the batch"),
    },
    async ({ recipientCount }) => {
      const res = await api.post("/api/v1/batch/estimate", { recipientCount });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // DEFI - SWAP (3 tools)
  // ============================================

  server.tool(
    "spraay_swap_quote",
    "Get a swap quote from Uniswap V3 on Base. Returns expected output amount, fee tier, and price impact. Costs $0.002 USDC.",
    {
      tokenIn: z.string().describe("Input token symbol (e.g. USDC) or contract address"),
      tokenOut: z.string().describe("Output token symbol (e.g. WETH) or contract address"),
      amountIn: z.string().describe("Input amount in raw units (e.g. 1000000 for 1 USDC)"),
    },
    async ({ tokenIn, tokenOut, amountIn }) => {
      const res = await api.get("/api/v1/swap/quote", { params: { tokenIn, tokenOut, amountIn } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_swap_tokens",
    "List all supported swap tokens on the Spraay gateway. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/swap/tokens");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_swap_execute",
    "Execute a token swap via Uniswap V3 on Base. Returns unsigned swap transaction for user signing. Costs $0.01 USDC.",
    {
      tokenIn: z.string().describe("Input token symbol or address"),
      tokenOut: z.string().describe("Output token symbol or address"),
      amountIn: z.string().describe("Human-readable amount to swap (e.g. '100' for 100 USDC)"),
      recipient: z.string().describe("Address to receive swapped tokens"),
      slippageBps: z.number().optional().describe("Slippage tolerance in basis points (default 50 = 0.5%)"),
    },
    async ({ tokenIn, tokenOut, amountIn, recipient, slippageBps }) => {
      const res = await api.post("/api/v1/swap/execute", { tokenIn, tokenOut, amountIn, recipient, ...(slippageBps && { slippageBps }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // ORACLE (3 tools)
  // ============================================

  server.tool(
    "spraay_oracle_prices",
    "Get real-time on-chain token prices on Base via Uniswap V3. Returns USD prices with confidence scores. Costs $0.003 USDC.",
    {
      tokens: z.string().optional().describe("Comma-separated token symbols (e.g. 'ETH,cbBTC,AERO'). Omit for all."),
    },
    async ({ tokens }) => {
      const res = await api.get("/api/v1/oracle/prices", { params: tokens ? { tokens } : {} });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_oracle_gas",
    "Get current gas prices on Base. Returns gas price in gwei and estimated costs for common operations. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/oracle/gas");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_oracle_fx",
    "Get stablecoin exchange rates with depeg detection. Compare USDC, USDT, DAI, EURC rates. Costs $0.002 USDC.",
    {
      base: z.string().optional().describe("Base stablecoin symbol (default: USDC)"),
    },
    async ({ base }) => {
      const res = await api.get("/api/v1/oracle/fx", { params: base ? { base } : {} });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // BRIDGE (2 tools)
  // ============================================

  server.tool(
    "spraay_bridge_quote",
    "Get a cross-chain bridge quote via LI.FI aggregator. Supports 8 chains: Base, Ethereum, Arbitrum, Polygon, BNB, Avalanche, Optimism, Unichain. Costs $0.005 USDC.",
    {
      fromChain: z.string().describe("Source chain (base, ethereum, arbitrum, polygon, bnb, avalanche, optimism, unichain)"),
      toChain: z.string().describe("Destination chain"),
      token: z.string().describe("Token symbol to bridge (e.g. USDC, USDT, ETH)"),
      amount: z.string().describe("Amount in raw units"),
      fromAddress: z.string().describe("Sender wallet address"),
    },
    async ({ fromChain, toChain, token, amount, fromAddress }) => {
      const res = await api.get("/api/v1/bridge/quote", { params: { fromChain, toChain, token, amount, fromAddress } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_bridge_chains",
    "List all supported bridge chains with chain IDs, native tokens, and explorer URLs. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/bridge/chains");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // PAYROLL (3 tools)
  // ============================================

  server.tool(
    "spraay_payroll_execute",
    "Execute payroll batch payment via Spraay V2. Pay up to 200 employees in one transaction with stablecoins. Returns unsigned transactions. Costs $0.02 USDC.",
    {
      token: z.string().describe("Stablecoin symbol (USDC, USDT, DAI, EURC, USDbC)"),
      sender: z.string().describe("Employer/payer wallet address"),
      employees: z.array(z.object({
        address: z.string().describe("Employee wallet address"),
        amount: z.string().describe("Payment amount (human-readable, e.g. '3000')"),
        label: z.string().optional().describe("Employee name or label"),
      })).describe("Array of employee payment objects"),
      memo: z.string().optional().describe("Payroll memo or reference"),
    },
    async ({ token, sender, employees, memo }) => {
      const res = await api.post("/api/v1/payroll/execute", { token, sender, employees, ...(memo && { memo }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_payroll_estimate",
    "Estimate gas and fees for a payroll run. Costs $0.002 USDC.",
    {
      employeeCount: z.number().describe("Number of employees to pay"),
      amount: z.string().optional().describe("Optional total amount for fee calculation"),
    },
    async ({ employeeCount, amount }) => {
      const res = await api.post("/api/v1/payroll/estimate", { employeeCount, ...(amount && { amount }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_payroll_tokens",
    "List supported stablecoins for payroll. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/payroll/tokens");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // INVOICE (3 tools)
  // ============================================

  server.tool(
    "spraay_invoice_create",
    "Create an on-chain invoice with pre-encoded payment transaction. Supports USDC, USDT, DAI, EURC, WETH. Costs $0.005 USDC.",
    {
      creator: z.string().describe("Invoice creator (payee) address"),
      token: z.string().describe("Payment token symbol"),
      amount: z.string().describe("Invoice amount (human-readable)"),
      recipient: z.string().optional().describe("Payer address (omit for open invoice anyone can pay)"),
      memo: z.string().optional().describe("Invoice description"),
      reference: z.string().optional().describe("External reference number"),
      dueDate: z.string().optional().describe("Due date in ISO format"),
    },
    async ({ creator, token, amount, recipient, memo, reference, dueDate }) => {
      const res = await api.post("/api/v1/invoice/create", {
        creator, token, amount,
        ...(recipient && { recipient }),
        ...(memo && { memo }),
        ...(reference && { reference }),
        ...(dueDate && { dueDate }),
      });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_invoice_list",
    "List invoices by creator or recipient address. Optionally filter by status. Costs $0.002 USDC.",
    {
      address: z.string().describe("Address to look up invoices for"),
      status: z.string().optional().describe("Filter by status: pending, paid, expired, cancelled"),
    },
    async ({ address, status }) => {
      const res = await api.get("/api/v1/invoice/list", { params: { address, ...(status && { status }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_invoice_get",
    "Look up a specific invoice by ID. Returns full details with payment status. Costs $0.001 USDC.",
    {
      id: z.string().describe("Invoice ID (e.g. INV-A1B2C3D4E5F6)"),
    },
    async ({ id }) => {
      const res = await api.get(`/api/v1/invoice/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // ANALYTICS (2 tools)
  // ============================================

  server.tool(
    "spraay_analytics_wallet",
    "Get comprehensive wallet profile on Base: ETH + token balances, tx count, wallet age, classification (virgin/new/casual/active/power-user), portfolio breakdown. Costs $0.005 USDC.",
    {
      address: z.string().describe("Wallet address to profile"),
    },
    async ({ address }) => {
      const res = await api.get("/api/v1/analytics/wallet", { params: { address } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_analytics_txhistory",
    "Get recent transaction history for a wallet on Base. Decoded types (eth-send, erc20-transfer, swap, contract-call), direction, gas costs, success rates. Costs $0.003 USDC.",
    {
      address: z.string().describe("Wallet address"),
      limit: z.number().optional().describe("Number of transactions (default 10, max 50)"),
    },
    async ({ address, limit }) => {
      const res = await api.get("/api/v1/analytics/txhistory", { params: { address, ...(limit && { limit: limit.toString() }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // ESCROW (6 tools)
  // ============================================

  server.tool(
    "spraay_escrow_create",
    "Create a conditional escrow on Base. Depositor locks funds, released to beneficiary when conditions met. Supports milestones, arbiter, and expiry. Costs $0.008 USDC.",
    {
      depositor: z.string().describe("Depositor (payer) wallet address"),
      beneficiary: z.string().describe("Beneficiary (payee) wallet address"),
      token: z.string().describe("Token symbol (USDC, USDT, DAI, EURC, WETH)"),
      amount: z.string().describe("Amount (human-readable, e.g. '5000')"),
      arbiter: z.string().optional().describe("Optional third-party arbiter address"),
      description: z.string().optional().describe("What the escrow is for"),
      conditions: z.array(z.string()).optional().describe("Release conditions / milestones"),
      expiresIn: z.number().optional().describe("Expiration in hours (default 168 = 7 days)"),
    },
    async ({ depositor, beneficiary, token, amount, arbiter, description, conditions, expiresIn }) => {
      const res = await api.post("/api/v1/escrow/create", {
        depositor, beneficiary, token, amount,
        ...(arbiter && { arbiter }),
        ...(description && { description }),
        ...(conditions && { conditions }),
        ...(expiresIn && { expiresIn }),
      });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_escrow_list",
    "List escrows by depositor, beneficiary, or arbiter address. Costs $0.002 USDC.",
    {
      address: z.string().describe("Address to look up escrows for"),
      status: z.string().optional().describe("Filter: created, funded, released, cancelled, expired"),
    },
    async ({ address, status }) => {
      const res = await api.get("/api/v1/escrow/list", { params: { address, ...(status && { status }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_escrow_get",
    "Get escrow status and details by ID. Costs $0.001 USDC.",
    {
      id: z.string().describe("Escrow ID (e.g. ESC-A1B2C3D4E5F6)"),
    },
    async ({ id }) => {
      const res = await api.get(`/api/v1/escrow/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_escrow_fund",
    "Mark an escrow as funded after depositor has transferred tokens. Costs $0.002 USDC.",
    {
      escrowId: z.string().describe("Escrow ID to fund"),
    },
    async ({ escrowId }) => {
      const res = await api.post("/api/v1/escrow/fund", { escrowId });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_escrow_release",
    "Release escrowed funds to beneficiary. Returns unsigned transfer transaction. Only depositor or arbiter can release. Costs $0.005 USDC.",
    {
      escrowId: z.string().describe("Escrow ID to release"),
      caller: z.string().describe("Address of depositor or arbiter releasing funds"),
    },
    async ({ escrowId, caller }) => {
      const res = await api.post("/api/v1/escrow/release", { escrowId, caller });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_escrow_cancel",
    "Cancel an escrow. Depositor only if unfunded; depositor or arbiter if funded. Costs $0.002 USDC.",
    {
      escrowId: z.string().describe("Escrow ID to cancel"),
      caller: z.string().describe("Address of depositor (or arbiter if funded)"),
    },
    async ({ escrowId, caller }) => {
      const res = await api.post("/api/v1/escrow/cancel", { escrowId, caller });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // DATA (3 tools)
  // ============================================

  server.tool(
    "spraay_prices",
    "Get live on-chain token prices on Base for 8+ major tokens (WETH, cbBTC, AERO, etc). Costs $0.002 USDC.",
    {
      token: z.string().optional().describe("Specific token symbol (e.g. WETH). Omit for all."),
    },
    async ({ token }) => {
      const res = await api.get("/api/v1/prices", { params: token ? { token } : {} });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_balances",
    "Get ETH + ERC-20 token balances for any wallet on Base. Checks 8+ popular tokens. Costs $0.002 USDC.",
    {
      address: z.string().describe("Wallet address to check"),
      tokens: z.string().optional().describe("Comma-separated custom token addresses"),
      showAll: z.string().optional().describe("'true' to include zero balances"),
    },
    async ({ address, tokens, showAll }) => {
      const res = await api.get("/api/v1/balances", { params: { address, ...(tokens && { tokens }), ...(showAll && { showAll }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_resolve",
    "Resolve ENS names (.eth) and Basenames (.base.eth) to wallet addresses. Supports reverse lookup. Costs $0.001 USDC.",
    {
      name: z.string().describe("ENS name, Basename, or address for reverse lookup"),
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
    version: "2.0.0",
  });
  const mockApi = axios.create({ baseURL: gatewayURL });
  registerTools(server, mockApi);
  return server;
}

async function main() {
  const api = await createPaymentClient();
  const server = new McpServer({
    name: "Spraay x402 Gateway",
    version: "2.0.0",
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
