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
      const res = await api.post("/api/v1/chat/completions", { model, messages, max_tokens: 1000 });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_models",
    "List all available AI models on the Spraay x402 Gateway. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/models");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Payments (2 tools)
  // ============================================

  server.tool(
    "spraay_batch_execute",
    "Execute batch payment to up to 200 recipients in one transaction via Spraay protocol. Supports any ERC-20 token or native ETH on Base. Costs $0.01 USDC.",
    {
      token: z.string().describe("Token symbol (e.g. USDC, ETH, WETH, DAI) or contract address"),
      recipients: z.array(z.string()).describe("Array of recipient wallet addresses"),
      amounts: z.array(z.string()).describe("Array of amounts (in token units, e.g. '100' for 100 USDC)"),
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
      recipientCount: z.number().describe("Number of recipients"),
      token: z.string().optional().describe("Token symbol (default: USDC)"),
    },
    async ({ recipientCount, token }) => {
      const res = await api.post("/api/v1/batch/estimate", { recipientCount, ...(token && { token }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // DeFi — Swap (3 tools)
  // ============================================

  server.tool(
    "spraay_swap_quote",
    "Get a swap quote from Uniswap V3 on Base. Returns expected output amount and price impact. Costs $0.002 USDC.",
    {
      tokenIn: z.string().describe("Input token symbol (e.g. USDC, WETH)"),
      tokenOut: z.string().describe("Output token symbol"),
      amountIn: z.string().describe("Amount to swap (in smallest units or human-readable)"),
    },
    async ({ tokenIn, tokenOut, amountIn }) => {
      const res = await api.get("/api/v1/swap/quote", { params: { tokenIn, tokenOut, amountIn } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_swap_tokens",
    "List all tokens available for swapping on Spraay/Uniswap V3. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/swap/tokens");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_swap_execute",
    "Execute a token swap via Uniswap V3. Returns unsigned transaction data for the caller to sign. Costs $0.01 USDC.",
    {
      tokenIn: z.string().describe("Input token symbol"),
      tokenOut: z.string().describe("Output token symbol"),
      amountIn: z.string().describe("Amount to swap"),
      recipient: z.string().describe("Recipient address for swap output"),
      slippage: z.number().optional().describe("Slippage tolerance (default 0.5%)"),
    },
    async ({ tokenIn, tokenOut, amountIn, recipient, slippage }) => {
      const res = await api.post("/api/v1/swap/execute", { tokenIn, tokenOut, amountIn, recipient, ...(slippage && { slippage }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Oracle (3 tools)
  // ============================================

  server.tool(
    "spraay_oracle_prices",
    "Get on-chain token prices with confidence scores via Uniswap V3 QuoterV2. Costs $0.003 USDC.",
    {
      tokens: z.string().optional().describe("Comma-separated token symbols (e.g. ETH,cbBTC). Omit for all."),
    },
    async ({ tokens }) => {
      const res = await api.get("/api/v1/oracle/prices", { params: tokens ? { tokens } : {} });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_oracle_gas",
    "Get current gas prices on Base in gwei. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/oracle/gas");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_oracle_fx",
    "Get stablecoin exchange rates with depeg detection. Costs $0.002 USDC.",
    {
      base: z.string().optional().describe("Base stablecoin (default: USDC)"),
    },
    async ({ base: baseCoin }) => {
      const res = await api.get("/api/v1/oracle/fx", { params: baseCoin ? { base: baseCoin } : {} });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Bridge (2 tools)
  // ============================================

  server.tool(
    "spraay_bridge_quote",
    "Get a cross-chain bridge quote via LI.FI. Supports 8+ chains. Costs $0.005 USDC.",
    {
      fromChain: z.string().describe("Source chain (e.g. base, ethereum, arbitrum)"),
      toChain: z.string().describe("Destination chain"),
      token: z.string().describe("Token symbol (e.g. USDC)"),
      amount: z.string().describe("Amount in smallest units"),
      fromAddress: z.string().describe("Sender address"),
    },
    async ({ fromChain, toChain, token, amount, fromAddress }) => {
      const res = await api.get("/api/v1/bridge/quote", { params: { fromChain, toChain, token, amount, fromAddress } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_bridge_chains",
    "List all supported bridge chains. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/bridge/chains");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Payroll (3 tools)
  // ============================================

  server.tool(
    "spraay_payroll_execute",
    "Execute payroll batch payment via Spraay V2. Supports up to 200 employees. Costs $0.02 USDC.",
    {
      token: z.string().describe("Payment token (e.g. USDC, USDT, DAI)"),
      sender: z.string().describe("Sender/employer wallet address"),
      employees: z.array(z.object({ address: z.string(), amount: z.string(), label: z.string().optional() })).describe("Array of {address, amount, label?}"),
    },
    async ({ token, sender, employees }) => {
      const res = await api.post("/api/v1/payroll/execute", { token, sender, employees });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_payroll_estimate",
    "Estimate payroll gas and fees. Costs $0.002 USDC.",
    {
      employeeCount: z.number().describe("Number of employees"),
      token: z.string().optional().describe("Payment token (default: USDC)"),
    },
    async ({ employeeCount, token }) => {
      const res = await api.post("/api/v1/payroll/estimate", { employeeCount, ...(token && { token }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_payroll_tokens",
    "List supported payroll stablecoins. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/payroll/tokens");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Invoice (3 tools)
  // ============================================

  server.tool(
    "spraay_invoice_create",
    "Create an invoice with pre-encoded payment transaction. Costs $0.005 USDC.",
    {
      creator: z.string().describe("Invoice creator address"),
      token: z.string().describe("Payment token (e.g. USDC)"),
      amount: z.string().describe("Invoice amount"),
      recipient: z.string().optional().describe("Payment recipient (defaults to creator)"),
      memo: z.string().optional().describe("Invoice memo/description"),
      dueDate: z.string().optional().describe("Due date (ISO 8601)"),
    },
    async ({ creator, token, amount, recipient, memo, dueDate }) => {
      const res = await api.post("/api/v1/invoice/create", { creator, token, amount, ...(recipient && { recipient }), ...(memo && { memo }), ...(dueDate && { dueDate }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_invoice_list",
    "List invoices by address with optional status filter. Costs $0.002 USDC.",
    {
      address: z.string().describe("Address to list invoices for"),
      status: z.string().optional().describe("Filter by status (pending, paid, overdue, cancelled)"),
    },
    async ({ address, status }) => {
      const res = await api.get("/api/v1/invoice/list", { params: { address, ...(status && { status }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_invoice_get",
    "Look up a specific invoice by ID. Costs $0.001 USDC.",
    {
      id: z.string().describe("Invoice ID (e.g. INV-A1B2)"),
    },
    async ({ id }) => {
      const res = await api.get(`/api/v1/invoice/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Analytics (2 tools)
  // ============================================

  server.tool(
    "spraay_analytics_wallet",
    "Get comprehensive wallet profile including balances, age, classification, and portfolio breakdown. Costs $0.005 USDC.",
    {
      address: z.string().describe("Wallet address to analyze"),
    },
    async ({ address }) => {
      const res = await api.get("/api/v1/analytics/wallet", { params: { address } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_analytics_txhistory",
    "Get decoded transaction history for any address on Base. Costs $0.003 USDC.",
    {
      address: z.string().describe("Wallet address"),
      limit: z.string().optional().describe("Max transactions to return (default 10)"),
    },
    async ({ address, limit }) => {
      const res = await api.get("/api/v1/analytics/txhistory", { params: { address, ...(limit && { limit }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Escrow (6 tools)
  // ============================================

  server.tool(
    "spraay_escrow_create",
    "Create a conditional escrow with optional milestones, arbiter, and expiry. Costs $0.008 USDC.",
    {
      depositor: z.string().describe("Depositor/client address"),
      beneficiary: z.string().describe("Beneficiary/freelancer address"),
      token: z.string().describe("Token symbol (e.g. USDC)"),
      amount: z.string().describe("Escrow amount"),
      arbiter: z.string().optional().describe("Optional arbiter address"),
      conditions: z.array(z.string()).optional().describe("Milestone conditions"),
      expiresIn: z.number().optional().describe("Expiry in hours"),
    },
    async ({ depositor, beneficiary, token, amount, arbiter, conditions, expiresIn }) => {
      const res = await api.post("/api/v1/escrow/create", { depositor, beneficiary, token, amount, ...(arbiter && { arbiter }), ...(conditions && { conditions }), ...(expiresIn && { expiresIn }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_escrow_list",
    "List escrows by address with optional status filter. Costs $0.002 USDC.",
    {
      address: z.string().describe("Address to list escrows for (depositor, beneficiary, or arbiter)"),
      status: z.string().optional().describe("Filter by status"),
    },
    async ({ address, status }) => {
      const res = await api.get("/api/v1/escrow/list", { params: { address, ...(status && { status }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_escrow_get",
    "Get escrow details and status by ID. Costs $0.001 USDC.",
    {
      id: z.string().describe("Escrow ID (e.g. ESC-A1B2)"),
    },
    async ({ id }) => {
      const res = await api.get(`/api/v1/escrow/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_escrow_fund",
    "Mark an escrow as funded. Costs $0.002 USDC.",
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
    "Release escrow funds to beneficiary. Returns unsigned transfer tx. Depositor or arbiter only. Costs $0.005 USDC.",
    {
      escrowId: z.string().describe("Escrow ID to release"),
      caller: z.string().describe("Caller address (must be depositor or arbiter)"),
    },
    async ({ escrowId, caller }) => {
      const res = await api.post("/api/v1/escrow/release", { escrowId, caller });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_escrow_cancel",
    "Cancel an escrow. Costs $0.002 USDC.",
    {
      escrowId: z.string().describe("Escrow ID to cancel"),
      caller: z.string().describe("Caller address"),
    },
    async ({ escrowId, caller }) => {
      const res = await api.post("/api/v1/escrow/cancel", { escrowId, caller });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Inference (4 tools)
  // ============================================

  server.tool(
    "spraay_classify_address",
    "AI-powered wallet classification with risk scoring. Classifies addresses as whale, retail, MEV bot, etc. Costs $0.008 USDC.",
    {
      address: z.string().describe("Ethereum/Base address to classify"),
    },
    async ({ address }) => {
      const res = await api.post("/api/v1/inference/classify-address", { address });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_classify_tx",
    "AI-powered transaction classification with risk scoring. Decodes and analyzes any Base transaction. Costs $0.008 USDC.",
    {
      hash: z.string().describe("Transaction hash to classify"),
    },
    async ({ hash }) => {
      const res = await api.post("/api/v1/inference/classify-tx", { hash });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_explain_contract",
    "AI-powered smart contract analysis. Explains what a verified contract does, its functions, and security properties. Costs $0.01 USDC.",
    {
      address: z.string().describe("Contract address to analyze"),
    },
    async ({ address }) => {
      const res = await api.post("/api/v1/inference/explain-contract", { address });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_summarize",
    "AI intelligence briefing for any address or transaction. Returns structured risk assessment and actionable insights. Costs $0.008 USDC.",
    {
      target: z.string().describe("Address or tx hash to summarize"),
      context: z.string().optional().describe("Context hint (defi, nft, governance, etc)"),
    },
    async ({ target, context }) => {
      const res = await api.post("/api/v1/inference/summarize", { target, ...(context && { context }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Communication — Email/SMS (3 tools)
  // ============================================

  server.tool(
    "spraay_notify_email",
    "Send email notification for payment confirmations, alerts, or receipts. Costs $0.003 USDC.",
    {
      to: z.string().describe("Recipient email address"),
      subject: z.string().optional().describe("Email subject line"),
      body: z.string().describe("Email body content"),
      cc: z.string().optional().describe("CC email address"),
      replyTo: z.string().optional().describe("Reply-to address"),
    },
    async ({ to, subject, body, cc, replyTo }) => {
      const res = await api.post("/api/v1/notify/email", { to, body, ...(subject && { subject }), ...(cc && { cc }), ...(replyTo && { replyTo }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_notify_sms",
    "Send SMS notification for payment alerts. E.164 phone format required. Costs $0.005 USDC.",
    {
      to: z.string().describe("Phone number in E.164 format (e.g. +14155551234)"),
      body: z.string().describe("SMS message body (max 1600 chars)"),
    },
    async ({ to, body }) => {
      const res = await api.post("/api/v1/notify/sms", { to, body });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_notify_status",
    "Check delivery status of an email or SMS notification. Costs $0.001 USDC.",
    {
      id: z.string().describe("Notification ID (e.g. ntf_123)"),
    },
    async ({ id }) => {
      const res = await api.get("/api/v1/notify/status", { params: { id } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Communication — Webhook (4 tools)
  // ============================================

  server.tool(
    "spraay_webhook_register",
    "Register a webhook endpoint to receive payment, escrow, swap, and other events. Costs $0.003 USDC.",
    {
      url: z.string().describe("Webhook URL to receive POST events"),
      events: z.array(z.string()).describe("Events to subscribe to (e.g. payment.sent, escrow.funded, swap.completed)"),
    },
    async ({ url, events }) => {
      const res = await api.post("/api/v1/webhook/register", { url, events });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_webhook_test",
    "Send a test event to a registered webhook to verify delivery. Costs $0.002 USDC.",
    {
      webhookId: z.string().describe("Webhook ID to test"),
    },
    async ({ webhookId }) => {
      const res = await api.post("/api/v1/webhook/test", { webhookId });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_webhook_list",
    "List all registered webhooks with status and event subscriptions. Costs $0.001 USDC.",
    {
      status: z.string().optional().describe("Filter by status (active, paused, failed)"),
    },
    async ({ status }) => {
      const res = await api.get("/api/v1/webhook/list", { params: status ? { status } : {} });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_webhook_delete",
    "Delete a registered webhook. Costs $0.001 USDC.",
    {
      webhookId: z.string().describe("Webhook ID to delete"),
    },
    async ({ webhookId }) => {
      const res = await api.post("/api/v1/webhook/delete", { webhookId });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Communication — XMTP (2 tools)
  // ============================================

  server.tool(
    "spraay_xmtp_send",
    "Send an encrypted XMTP message to any Ethereum address. Costs $0.003 USDC.",
    {
      to: z.string().describe("Recipient Ethereum address"),
      content: z.string().describe("Message content"),
      contentType: z.string().optional().describe("Content type (default: text/plain)"),
    },
    async ({ to, content, contentType }) => {
      const res = await api.post("/api/v1/xmtp/send", { to, content, ...(contentType && { contentType }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_xmtp_inbox",
    "Read XMTP inbox messages for an Ethereum address. Costs $0.002 USDC.",
    {
      address: z.string().describe("Ethereum address to check inbox for"),
      limit: z.string().optional().describe("Max messages to return (default 20)"),
    },
    async ({ address, limit }) => {
      const res = await api.get("/api/v1/xmtp/inbox", { params: { address, ...(limit && { limit }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Infrastructure — RPC (2 tools)
  // ============================================

  server.tool(
    "spraay_rpc_call",
    "Make a premium multi-chain JSON-RPC call via Alchemy/Helius. Supports Base, Ethereum, Arbitrum, Polygon, and more. Costs $0.001 USDC.",
    {
      chain: z.string().describe("Chain ID (e.g. base, ethereum, arbitrum, polygon, solana)"),
      method: z.string().describe("RPC method (e.g. eth_getBalance, eth_blockNumber, eth_call)"),
      params: z.array(z.any()).optional().describe("RPC method parameters"),
    },
    async ({ chain, method, params }) => {
      const res = await api.post("/api/v1/rpc/call", { chain, method, ...(params && { params }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_rpc_chains",
    "List supported RPC chains and allowed methods. Costs $0.001 USDC.",
    {},
    async () => {
      const res = await api.get("/api/v1/rpc/chains");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Infrastructure — IPFS/Arweave (3 tools)
  // ============================================

  server.tool(
    "spraay_storage_pin",
    "Pin content to IPFS or Arweave for permanent decentralized storage. Costs $0.005 USDC.",
    {
      data: z.string().describe("Content to pin (JSON string, base64, or text)"),
      contentType: z.string().optional().describe("MIME type (default: application/octet-stream)"),
      provider: z.string().optional().describe("Storage provider: ipfs or arweave (default: ipfs)"),
    },
    async ({ data, contentType, provider }) => {
      const res = await api.post("/api/v1/storage/pin", { data, ...(contentType && { contentType }), ...(provider && { provider }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_storage_get",
    "Retrieve pinned content by CID from IPFS/Arweave. Costs $0.002 USDC.",
    {
      cid: z.string().describe("Content identifier (CID) to retrieve"),
    },
    async ({ cid }) => {
      const res = await api.get("/api/v1/storage/get", { params: { cid } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_storage_status",
    "Check pin status for a storage request. Costs $0.001 USDC.",
    {
      id: z.string().describe("Pin request ID (e.g. pin_123)"),
    },
    async ({ id }) => {
      const res = await api.get("/api/v1/storage/status", { params: { id } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Infrastructure — Cron/Scheduler (3 tools)
  // ============================================

  server.tool(
    "spraay_cron_create",
    "Create a scheduled job for recurring payments, DCA, reminders, or any gateway action. Costs $0.005 USDC.",
    {
      action: z.string().describe("Action to schedule (e.g. batch.execute, swap.execute, notify.email, payroll.execute)"),
      schedule: z.string().describe("Cron expression (5-part: min hour dom mon dow)"),
      payload: z.record(z.string(), z.any()).describe("Payload for the action"),
      maxRuns: z.number().optional().describe("Max number of executions (omit for unlimited)"),
    },
    async ({ action, schedule, payload, maxRuns }) => {
      const res = await api.post("/api/v1/cron/create", { action, schedule, payload, ...(maxRuns && { maxRuns }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_cron_list",
    "List scheduled jobs with optional status/action filter. Costs $0.001 USDC.",
    {
      status: z.string().optional().describe("Filter by status (active, paused, cancelled, completed)"),
      action: z.string().optional().describe("Filter by action type"),
    },
    async ({ status, action }) => {
      const res = await api.get("/api/v1/cron/list", { params: { ...(status && { status }), ...(action && { action }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_cron_cancel",
    "Cancel a scheduled job. Costs $0.001 USDC.",
    {
      jobId: z.string().describe("Job ID to cancel"),
    },
    async ({ jobId }) => {
      const res = await api.post("/api/v1/cron/cancel", { jobId });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Infrastructure — Logging (2 tools)
  // ============================================

  server.tool(
    "spraay_logs_ingest",
    "Ingest structured logs for debugging agent workflows. Max 100 entries per batch. Costs $0.001 USDC.",
    {
      entries: z.array(z.object({
        level: z.string().describe("Log level: debug, info, warn, error"),
        service: z.string().describe("Service name (e.g. batch-agent, swap-bot)"),
        message: z.string().describe("Log message"),
        data: z.record(z.string(), z.any()).optional().describe("Additional structured data"),
      })).describe("Array of log entries"),
    },
    async ({ entries }) => {
      const res = await api.post("/api/v1/logs/ingest", { entries });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_logs_query",
    "Query structured logs by service, level, and time range. Costs $0.003 USDC.",
    {
      service: z.string().optional().describe("Filter by service name"),
      level: z.string().optional().describe("Filter by level (debug, info, warn, error)"),
      since: z.string().optional().describe("Start time (ISO 8601)"),
      limit: z.string().optional().describe("Max results (default 50, max 500)"),
    },
    async ({ service, level, since, limit }) => {
      const res = await api.get("/api/v1/logs/query", { params: { ...(service && { service }), ...(level && { level }), ...(since && { since }), ...(limit && { limit }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Identity & Access — KYC (2 tools)
  // ============================================

  server.tool(
    "spraay_kyc_verify",
    "Initiate KYC/KYB verification for compliance-gated payments. Costs $0.05 USDC.",
    {
      address: z.string().describe("Ethereum address to verify"),
      type: z.string().optional().describe("Verification type: individual or business (default: individual)"),
      level: z.string().optional().describe("Verification level: basic, enhanced, or full (default: basic)"),
    },
    async ({ address, type, level }) => {
      const res = await api.post("/api/v1/kyc/verify", { address, ...(type && { type }), ...(level && { level }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_kyc_status",
    "Check KYC verification status by ID or address. Costs $0.005 USDC.",
    {
      id: z.string().optional().describe("KYC record ID"),
      address: z.string().optional().describe("Ethereum address (alternative lookup)"),
    },
    async ({ id, address }) => {
      const res = await api.get("/api/v1/kyc/status", { params: { ...(id && { id }), ...(address && { address }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Identity & Access — Auth/SSO (2 tools)
  // ============================================

  server.tool(
    "spraay_auth_session",
    "Create an authenticated session with scoped permissions and TTL. Costs $0.005 USDC.",
    {
      address: z.string().describe("Ethereum address to create session for"),
      permissions: z.array(z.string()).optional().describe("Scoped permissions (e.g. batch:execute, swap:execute). Omit for all."),
      ttlSeconds: z.number().optional().describe("Session TTL in seconds (default 3600, max 86400)"),
    },
    async ({ address, permissions, ttlSeconds }) => {
      const res = await api.post("/api/v1/auth/session", { address, ...(permissions && { permissions }), ...(ttlSeconds && { ttlSeconds }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_auth_verify",
    "Verify a session token and check its permissions. Costs $0.001 USDC.",
    {
      token: z.string().describe("Session token (spr_...)"),
    },
    async ({ token }) => {
      const res = await api.get("/api/v1/auth/verify", { params: { token } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Compliance — Audit Trail (2 tools)
  // ============================================

  server.tool(
    "spraay_audit_log",
    "Record an immutable audit trail entry for payments, escrows, compliance actions. Costs $0.001 USDC.",
    {
      action: z.string().describe("Action type (e.g. payment.sent, escrow.created, kyc.completed)"),
      actor: z.string().describe("Actor address"),
      resource: z.string().describe("Resource identifier (e.g. batch_123, ESC-A1B2)"),
      details: z.record(z.string(), z.any()).optional().describe("Additional details"),
      txHash: z.string().optional().describe("Related transaction hash"),
    },
    async ({ action, actor, resource, details, txHash }) => {
      const res = await api.post("/api/v1/audit/log", { action, actor, resource, ...(details && { details }), ...(txHash && { txHash }) });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_audit_query",
    "Query audit trail by actor, action, resource, or time range. Costs $0.005 USDC.",
    {
      actor: z.string().optional().describe("Filter by actor address"),
      action: z.string().optional().describe("Filter by action type"),
      resource: z.string().optional().describe("Filter by resource (partial match)"),
      since: z.string().optional().describe("Start time (ISO 8601)"),
      until: z.string().optional().describe("End time (ISO 8601)"),
      limit: z.string().optional().describe("Max results (default 50)"),
    },
    async ({ actor, action, resource, since, until, limit }) => {
      const res = await api.get("/api/v1/audit/query", { params: { ...(actor && { actor }), ...(action && { action }), ...(resource && { resource }), ...(since && { since }), ...(until && { until }), ...(limit && { limit }) } });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Compliance — Tax (2 tools)
  // ============================================

  server.tool(
    "spraay_tax_calculate",
    "Calculate crypto tax gain/loss using FIFO method. Supports up to 500 transactions per batch. Costs $0.01 USDC.",
    {
      transactions: z.array(z.object({
        type: z.string().optional().describe("Transaction type: swap, send, receive, bridge, payroll, escrow_release"),
        asset: z.string().optional().describe("Asset symbol (e.g. ETH)"),
        amount: z.number().optional().describe("Amount"),
        costBasisUsd: z.number().optional().describe("Cost basis in USD"),
        proceedsUsd: z.number().optional().describe("Proceeds in USD"),
        holdingDays: z.number().optional().describe("Days held (for short/long term classification)"),
        txHash: z.string().optional().describe("Transaction hash"),
        timestamp: z.string().optional().describe("Transaction timestamp (ISO 8601)"),
      })).describe("Array of transaction objects"),
    },
    async ({ transactions }) => {
      const res = await api.post("/api/v1/tax/calculate", { transactions });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  server.tool(
    "spraay_tax_report",
    "Retrieve a previously calculated tax report. Costs $0.02 USDC.",
    {
      reportId: z.string().optional().describe("Report ID from tax/calculate"),
    },
    async ({ reportId }) => {
      const res = await api.get("/api/v1/tax/report", { params: reportId ? { reportId } : {} });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ============================================
  // Data (3 tools)
  // ============================================

  server.tool(
    "spraay_prices",
    "Get live on-chain token prices on Base. Costs $0.002 USDC.",
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
    "Get ETH + ERC-20 token balances for any wallet on Base. Costs $0.002 USDC.",
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
    version: "3.1.0",
  });
  const mockApi = axios.create({ baseURL: gatewayURL });
  registerTools(server, mockApi);
  return server;
}

// HTTP transport for Smithery/remote hosting
async function startHttpServer(api: any) {
  const app = express();
  app.use(express.json());

  app.get("/", (_req: any, res: any) => {
    res.json({
      name: "Spraay x402 MCP Server",
      version: "3.1.0",
      description: "57 MCP tools for full-stack DeFi infrastructure on Base. AI agents pay USDC per request via x402 protocol.",
      mcp: "/mcp",
      tools: 57,
      gateway: gatewayURL,
    });
  });

  app.all("/mcp", async (req: any, res: any) => {
    const server = new McpServer({
      name: "Spraay x402 Gateway",
      version: "3.1.0",
    });
    registerTools(server, api);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined as any });
    res.on("close", () => { transport.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(PORT, () => {
    console.log(`\n💧 Spraay MCP Server (HTTP) running on port ${PORT}`);
    console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`🔗 Gateway: ${gatewayURL}`);
    console.log(`🔧 57 tools available\n`);
  });
}

// Stdio transport for Claude Desktop / Cursor
async function startStdioServer(api: any) {
  const server = new McpServer({
    name: "Spraay x402 Gateway",
    version: "3.1.0",
  });
  registerTools(server, api);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main() {
  const api = await createPaymentClient();

  if (TRANSPORT === "http") {
    await startHttpServer(api);
  } else {
    await startStdioServer(api);
  }
}

// ============================================
// Smithery-compatible exports
// ============================================

// Config schema for Smithery UI — tells users what env vars are needed
export const configSchema = z.object({
  EVM_PRIVATE_KEY: z.string().describe("Private key of a wallet with USDC on Base mainnet. Used for automatic x402 micropayments."),
  SPRAAY_GATEWAY_URL: z.string().default("https://gateway.spraay.app").describe("Spraay x402 Gateway URL"),
});

// Default export: Smithery calls this to create the server
// When deployed on Smithery, config comes from user input
// When running locally, falls back to process.env
export default function createServer({ config }: { config?: z.infer<typeof configSchema> } = {}) {
  const gw = config?.SPRAAY_GATEWAY_URL || process.env.SPRAAY_GATEWAY_URL || "https://gateway.spraay.app";
  const evmKey = config?.EVM_PRIVATE_KEY || process.env.EVM_PRIVATE_KEY;

  const server = new McpServer({
    name: "Spraay",
    version: "3.1.0",
  });

  // If we have a real key, create a payment-enabled client
  // Otherwise, use a mock client (for Smithery scanning)
  let api: any;
  if (evmKey) {
    try {
      const client = new x402Client();
      const account = privateKeyToAccount(evmKey as `0x${string}`);
      const walletClient = createWalletClient({ account, chain: base, transport: http() });
      const publicClient = createPublicClient({ chain: base, transport: http() });
      const signer = { ...walletClient, readContract: publicClient.readContract } as any;
      registerExactEvmScheme(client, { signer });
      api = wrapAxiosWithPayment(axios.create({ baseURL: gw }), client);
    } catch {
      api = axios.create({ baseURL: gw });
    }
  } else {
    api = axios.create({ baseURL: gw });
  }

  registerTools(server, api);
  return server.server;
}

// Direct execution: stdio or http mode
if (process.env.EVM_PRIVATE_KEY) {
  main().catch((error) => {
    console.error("Spraay MCP server error:", error);
    process.exit(1);
  });
} else if (TRANSPORT === "http") {
  const mockApi = axios.create({ baseURL: gatewayURL });
  startHttpServer(mockApi).catch((error) => {
    console.error("Spraay MCP server error:", error);
    process.exit(1);
  });
}
