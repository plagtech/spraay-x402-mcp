#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import axios from "axios";
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { config } from "dotenv";
import { z } from "zod";
import express from "express";

config();

const gatewayURL = process.env.SPRAAY_GATEWAY_URL || "https://gateway.spraay.app";
const PORT = process.env.MCP_PORT || process.env.PORT || 3000;
const TRANSPORT = process.env.MCP_TRANSPORT || "stdio";

async function createPaymentClient() {
  const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
  if (!evmPrivateKey) {
    throw new Error("EVM_PRIVATE_KEY is required. Set it to a wallet with USDC on Base.");
  }
  const client = new x402Client();
  const account = privateKeyToAccount(evmPrivateKey);
  const walletClient = createWalletClient({ account, chain: base, transport: http() });
  const publicClient = createPublicClient({ chain: base, transport: http() });
  const signer = { ...walletClient, readContract: publicClient.readContract } as any;
  registerExactEvmScheme(client, { signer });
  return wrapAxiosWithPayment(axios.create({ baseURL: gatewayURL }), client);
}

function registerTools(server: McpServer, api: any) {

  // AI
  server.tool("spraay_chat", "Send a message to 200+ AI models (GPT-4, Claude, Llama, Gemini) via Spraay x402 Gateway. Costs $0.005 USDC.", {
    model: z.string().default("openai/gpt-4o-mini").describe("Model ID"),
    message: z.string().describe("User message"),
    systemPrompt: z.string().optional().describe("System prompt"),
  }, async ({ model, message, systemPrompt }: any) => {
    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: message });
    const res = await api.post("/api/v1/chat/completions", { model, messages });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_models", "List 200+ AI models with pricing. Costs $0.001 USDC.", {}, async () => {
    const res = await api.get("/api/v1/models");
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  // Payments
  server.tool("spraay_batch_execute", "Batch pay multiple recipients via Spraay V2 on Base. Any ERC-20 + ETH. Costs $0.01 USDC.", {
    token: z.string().describe("Token symbol or address"),
    recipients: z.array(z.string()).describe("Recipient addresses"),
    amounts: z.array(z.string()).describe("Amounts in raw units"),
    sender: z.string().describe("Sender address"),
  }, async ({ token, recipients, amounts, sender }: any) => {
    const res = await api.post("/api/v1/batch/execute", { token, recipients, amounts, sender });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_batch_estimate", "Estimate gas for batch payment. Costs $0.001 USDC.", {
    recipientCount: z.number().describe("Number of recipients"),
  }, async ({ recipientCount }: any) => {
    const res = await api.post("/api/v1/batch/estimate", { recipientCount });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  // Swap
  server.tool("spraay_swap_quote", "Uniswap V3 swap quote on Base. Costs $0.002 USDC.", {
    tokenIn: z.string().describe("Input token"),
    tokenOut: z.string().describe("Output token"),
    amountIn: z.string().describe("Amount in raw units"),
  }, async ({ tokenIn, tokenOut, amountIn }: any) => {
    const res = await api.get("/api/v1/swap/quote", { params: { tokenIn, tokenOut, amountIn } });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_swap_tokens", "List supported swap tokens. Costs $0.001 USDC.", {}, async () => {
    const res = await api.get("/api/v1/swap/tokens");
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_swap_execute", "Execute swap via Uniswap V3. Returns unsigned tx. Costs $0.01 USDC.", {
    tokenIn: z.string().describe("Input token"),
    tokenOut: z.string().describe("Output token"),
    amountIn: z.string().describe("Human-readable amount"),
    recipient: z.string().describe("Recipient address"),
    slippageBps: z.number().optional().describe("Slippage bps (default 50)"),
  }, async ({ tokenIn, tokenOut, amountIn, recipient, slippageBps }: any) => {
    const res = await api.post("/api/v1/swap/execute", { tokenIn, tokenOut, amountIn, recipient, ...(slippageBps && { slippageBps }) });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  // Oracle
  server.tool("spraay_oracle_prices", "On-chain token prices via Uniswap V3. Costs $0.003 USDC.", {
    tokens: z.string().optional().describe("Comma-separated symbols"),
  }, async ({ tokens }: any) => {
    const res = await api.get("/api/v1/oracle/prices", { params: tokens ? { tokens } : {} });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_oracle_gas", "Gas prices on Base. Costs $0.001 USDC.", {}, async () => {
    const res = await api.get("/api/v1/oracle/gas");
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_oracle_fx", "Stablecoin FX rates with depeg detection. Costs $0.002 USDC.", {
    base: z.string().optional().describe("Base stablecoin (default USDC)"),
  }, async ({ base }: any) => {
    const res = await api.get("/api/v1/oracle/fx", { params: base ? { base } : {} });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  // Bridge
  server.tool("spraay_bridge_quote", "Cross-chain bridge quote. 8 chains. Costs $0.005 USDC.", {
    fromChain: z.string().describe("Source chain"),
    toChain: z.string().describe("Dest chain"),
    token: z.string().describe("Token symbol"),
    amount: z.string().describe("Raw amount"),
    fromAddress: z.string().describe("Sender address"),
  }, async ({ fromChain, toChain, token, amount, fromAddress }: any) => {
    const res = await api.get("/api/v1/bridge/quote", { params: { fromChain, toChain, token, amount, fromAddress } });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_bridge_chains", "Supported bridge chains. Costs $0.001 USDC.", {}, async () => {
    const res = await api.get("/api/v1/bridge/chains");
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  // Payroll
  server.tool("spraay_payroll_execute", "Execute payroll. Up to 200 employees in stablecoins. Costs $0.02 USDC.", {
    token: z.string().describe("Stablecoin symbol"),
    sender: z.string().describe("Employer address"),
    employees: z.array(z.object({ address: z.string(), amount: z.string(), label: z.string().optional() })).describe("Employees"),
    memo: z.string().optional().describe("Payroll memo"),
  }, async ({ token, sender, employees, memo }: any) => {
    const res = await api.post("/api/v1/payroll/execute", { token, sender, employees, ...(memo && { memo }) });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_payroll_estimate", "Estimate payroll costs. Costs $0.002 USDC.", {
    employeeCount: z.number().describe("Employee count"),
    amount: z.string().optional().describe("Total amount"),
  }, async ({ employeeCount, amount }: any) => {
    const res = await api.post("/api/v1/payroll/estimate", { employeeCount, ...(amount && { amount }) });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_payroll_tokens", "List payroll stablecoins. Costs $0.001 USDC.", {}, async () => {
    const res = await api.get("/api/v1/payroll/tokens");
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  // Invoice
  server.tool("spraay_invoice_create", "Create invoice with payment tx. Costs $0.005 USDC.", {
    creator: z.string().describe("Payee address"),
    token: z.string().describe("Token symbol"),
    amount: z.string().describe("Amount"),
    recipient: z.string().optional().describe("Payer address"),
    memo: z.string().optional().describe("Description"),
    reference: z.string().optional().describe("Reference"),
    dueDate: z.string().optional().describe("Due date ISO"),
  }, async ({ creator, token, amount, recipient, memo, reference, dueDate }: any) => {
    const res = await api.post("/api/v1/invoice/create", { creator, token, amount, ...(recipient && { recipient }), ...(memo && { memo }), ...(reference && { reference }), ...(dueDate && { dueDate }) });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_invoice_list", "List invoices by address. Costs $0.002 USDC.", {
    address: z.string().describe("Address"),
    status: z.string().optional().describe("Filter"),
  }, async ({ address, status }: any) => {
    const res = await api.get("/api/v1/invoice/list", { params: { address, ...(status && { status }) } });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_invoice_get", "Invoice lookup by ID. Costs $0.001 USDC.", {
    id: z.string().describe("Invoice ID"),
  }, async ({ id }: any) => {
    const res = await api.get(`/api/v1/invoice/${id}`);
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  // Analytics
  server.tool("spraay_analytics_wallet", "Wallet profile: balances, age, classification. Costs $0.005 USDC.", {
    address: z.string().describe("Wallet address"),
  }, async ({ address }: any) => {
    const res = await api.get("/api/v1/analytics/wallet", { params: { address } });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_analytics_txhistory", "Transaction history with decoded types. Costs $0.003 USDC.", {
    address: z.string().describe("Wallet address"),
    limit: z.number().optional().describe("Count (default 10, max 50)"),
  }, async ({ address, limit }: any) => {
    const res = await api.get("/api/v1/analytics/txhistory", { params: { address, ...(limit && { limit: limit.toString() }) } });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  // Escrow
  server.tool("spraay_escrow_create", "Create conditional escrow with milestones. Costs $0.008 USDC.", {
    depositor: z.string().describe("Depositor address"),
    beneficiary: z.string().describe("Beneficiary address"),
    token: z.string().describe("Token symbol"),
    amount: z.string().describe("Amount"),
    arbiter: z.string().optional().describe("Arbiter address"),
    description: z.string().optional().describe("Purpose"),
    conditions: z.array(z.string()).optional().describe("Milestones"),
    expiresIn: z.number().optional().describe("Hours (default 168)"),
  }, async ({ depositor, beneficiary, token, amount, arbiter, description, conditions, expiresIn }: any) => {
    const res = await api.post("/api/v1/escrow/create", { depositor, beneficiary, token, amount, ...(arbiter && { arbiter }), ...(description && { description }), ...(conditions && { conditions }), ...(expiresIn && { expiresIn }) });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_escrow_list", "List escrows by address. Costs $0.002 USDC.", {
    address: z.string().describe("Address"),
    status: z.string().optional().describe("Filter"),
  }, async ({ address, status }: any) => {
    const res = await api.get("/api/v1/escrow/list", { params: { address, ...(status && { status }) } });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_escrow_get", "Escrow status by ID. Costs $0.001 USDC.", {
    id: z.string().describe("Escrow ID"),
  }, async ({ id }: any) => {
    const res = await api.get(`/api/v1/escrow/${id}`);
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_escrow_fund", "Mark escrow as funded. Costs $0.002 USDC.", {
    escrowId: z.string().describe("Escrow ID"),
  }, async ({ escrowId }: any) => {
    const res = await api.post("/api/v1/escrow/fund", { escrowId });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_escrow_release", "Release escrow to beneficiary. Returns unsigned tx. Costs $0.005 USDC.", {
    escrowId: z.string().describe("Escrow ID"),
    caller: z.string().describe("Depositor or arbiter"),
  }, async ({ escrowId, caller }: any) => {
    const res = await api.post("/api/v1/escrow/release", { escrowId, caller });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_escrow_cancel", "Cancel escrow. Costs $0.002 USDC.", {
    escrowId: z.string().describe("Escrow ID"),
    caller: z.string().describe("Depositor or arbiter"),
  }, async ({ escrowId, caller }: any) => {
    const res = await api.post("/api/v1/escrow/cancel", { escrowId, caller });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  // Data
  server.tool("spraay_prices", "Live token prices on Base. Costs $0.002 USDC.", {
    token: z.string().optional().describe("Token symbol"),
  }, async ({ token }: any) => {
    const res = await api.get("/api/v1/prices", { params: token ? { token } : {} });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_balances", "ETH + ERC-20 balances on Base. Costs $0.002 USDC.", {
    address: z.string().describe("Wallet address"),
    tokens: z.string().optional().describe("Custom tokens"),
    showAll: z.string().optional().describe("Include zeros"),
  }, async ({ address, tokens, showAll }: any) => {
    const res = await api.get("/api/v1/balances", { params: { address, ...(tokens && { tokens }), ...(showAll && { showAll }) } });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });

  server.tool("spraay_resolve", "ENS / Basename resolution. Costs $0.001 USDC.", {
    name: z.string().describe("Name or address"),
  }, async ({ name }: any) => {
    const res = await api.get("/api/v1/resolve", { params: { name } });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  });
}

// Sandbox for Smithery scanning
export function createSandboxServer() {
  const server = new McpServer({ name: "Spraay x402 Gateway", version: "2.0.0" });
  const mockApi = axios.create({ baseURL: gatewayURL });
  registerTools(server, mockApi);
  return server;
}

// HTTP transport
async function startHttpServer(api: any) {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    try {
      const server = new McpServer({ name: "Spraay x402 Gateway", version: "2.0.0" });
      registerTools(server, api);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      console.error("MCP request error:", err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  app.get("/mcp", async (req, res) => {
    res.writeHead(405).end(JSON.stringify({ error: "Use POST for MCP requests" }));
  });

  app.delete("/mcp", async (req, res) => {
    res.writeHead(405).end(JSON.stringify({ error: "Session termination not supported in stateless mode" }));
  });

  app.get("/health", (_req, res) => res.json({ status: "ok", tools: 29, version: "2.0.0" }));

  app.get("/", (_req, res) => res.json({
    name: "Spraay x402 MCP Server", version: "2.0.0",
    description: "29 tools for AI, payments, swaps, oracle, bridge, payroll, invoicing, escrow, analytics on Base.",
    mcp: "/mcp", tools: 29, gateway: gatewayURL,
  }));

  app.listen(PORT, () => {
    console.log(`\n💧 Spraay MCP Server (HTTP) on port ${PORT}`);
    console.log(`📡 MCP endpoint: /mcp`);
    console.log(`🔧 29 tools available\n`);
  });
}

// Stdio transport
async function startStdioServer(api: any) {
  const server = new McpServer({ name: "Spraay x402 Gateway", version: "2.0.0" });
  registerTools(server, api);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main() {
  const api = await createPaymentClient();
  if (TRANSPORT === "http") await startHttpServer(api);
  else await startStdioServer(api);
}

if (process.env.EVM_PRIVATE_KEY) {
  main().catch((err) => { console.error(err); process.exit(1); });
} else if (TRANSPORT === "http") {
  const mockApi = axios.create({ baseURL: gatewayURL });
  startHttpServer(mockApi).catch((err) => { console.error(err); process.exit(1); });
}
