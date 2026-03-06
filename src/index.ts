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

// Reusable Zod validators
const ethAddr = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address");
const txHash = z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Must be a valid transaction hash");
const positiveAmount = z.string().regex(/^\d+(\.\d+)?$/, "Must be a positive number");

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
    "Send a message to 200+ AI models (GPT-4o, Claude, Llama 3, Gemini, Mistral, etc.) via the Spraay x402 Gateway. Returns the model's completion. Use spraay_models to discover available model IDs. Costs $0.005 USDC.",
    {
      model: z.string().default("openai/gpt-4o-mini").describe("Model ID in OpenRouter format (e.g. 'openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3-70b-instruct'). Use spraay_models to list all."),
      message: z.string().min(1).max(32000).describe("User message to send to the model"),
      systemPrompt: z.string().max(8000).optional().describe("Optional system prompt to set model behavior and context"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ model, message, systemPrompt }) => {
      try {
        const messages: any[] = [];
        if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
        messages.push({ role: "user", content: message });
        const res = await api.post("/api/v1/chat/completions", { model, messages, max_tokens: 1000 });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Chat error: ${error.message}. Verify model ID with spraay_models.` }] };
      }
    }
  );

  server.tool(
    "spraay_models",
    "List all 200+ AI models available on the Spraay x402 Gateway. Returns model IDs, providers, and context window sizes. Costs $0.001 USDC.",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const res = await api.get("/api/v1/models");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Models list error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Payments (2 tools)
  // ============================================

  server.tool(
    "spraay_batch_execute",
    "Execute a batch payment to up to 200 recipients in a single Base transaction via the Spraay protocol. Supports any ERC-20 token or native ETH. Returns unsigned transaction data for the sender to sign. Costs $0.01 USDC.",
    {
      token: z.string().min(1).describe("Token symbol (e.g. 'USDC', 'ETH', 'WETH', 'DAI') or ERC-20 contract address on Base"),
      recipients: z.array(ethAddr.describe("Recipient wallet address")).min(1).max(200).describe("Array of 1-200 recipient wallet addresses"),
      amounts: z.array(z.string().min(1)).min(1).max(200).describe("Array of amounts in token units (e.g. '100' for 100 USDC). Must match recipients length."),
      sender: ethAddr.describe("Sender wallet address that will sign the transaction"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ token, recipients, amounts, sender }) => {
      try {
        const res = await api.post("/api/v1/batch/execute", { token, recipients, amounts, sender });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Batch execute error: ${error.message}. Ensure sender has sufficient ${token} balance.` }] };
      }
    }
  );

  server.tool(
    "spraay_batch_estimate",
    "Estimate gas cost for a batch payment before executing. Returns estimated gas in wei and USD equivalent. Costs $0.001 USDC.",
    {
      recipientCount: z.number().min(1).max(200).describe("Number of recipients (1-200)"),
      token: z.string().optional().describe("Token symbol (default: USDC)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ recipientCount, token }) => {
      try {
        const res = await api.post("/api/v1/batch/estimate", { recipientCount, ...(token && { token }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Batch estimate error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // DeFi — Swap (3 tools)
  // ============================================

  server.tool(
    "spraay_swap_quote",
    "Get a swap quote from Uniswap V3 on Base. Returns expected output amount, price impact, and route details. Use spraay_swap_tokens to see available tokens. Costs $0.002 USDC.",
    {
      tokenIn: z.string().min(1).describe("Input token symbol (e.g. 'USDC', 'WETH', 'DAI') or contract address"),
      tokenOut: z.string().min(1).describe("Output token symbol (e.g. 'WETH', 'USDC') or contract address"),
      amountIn: z.string().min(1).describe("Amount to swap in human-readable units (e.g. '1000' for 1000 USDC)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ tokenIn, tokenOut, amountIn }) => {
      try {
        const res = await api.get("/api/v1/swap/quote", { params: { tokenIn, tokenOut, amountIn } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Swap quote error: ${error.message}. Check token symbols with spraay_swap_tokens.` }] };
      }
    }
  );

  server.tool(
    "spraay_swap_tokens",
    "List all tokens available for swapping on Spraay via Uniswap V3 on Base. Returns symbols, addresses, and decimals. Costs $0.001 USDC.",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const res = await api.get("/api/v1/swap/tokens");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Swap tokens error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_swap_execute",
    "Execute a token swap via Uniswap V3 on Base. Returns unsigned transaction data for the caller to sign and broadcast. Get a quote first with spraay_swap_quote. Costs $0.01 USDC.",
    {
      tokenIn: z.string().min(1).describe("Input token symbol (e.g. 'USDC') or contract address"),
      tokenOut: z.string().min(1).describe("Output token symbol (e.g. 'WETH') or contract address"),
      amountIn: z.string().min(1).describe("Amount to swap in human-readable units"),
      recipient: ethAddr.describe("Recipient address for swap output (e.g. '0xYourWallet')"),
      slippage: z.number().min(0.01).max(50).optional().describe("Slippage tolerance in percent (default: 0.5, max: 50)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ tokenIn, tokenOut, amountIn, recipient, slippage }) => {
      try {
        const res = await api.post("/api/v1/swap/execute", { tokenIn, tokenOut, amountIn, recipient, ...(slippage && { slippage }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Swap execute error: ${error.message}. Get a quote first with spraay_swap_quote.` }] };
      }
    }
  );

  // ============================================
  // Oracle (3 tools)
  // ============================================

  server.tool(
    "spraay_oracle_prices",
    "Get real-time on-chain token prices with confidence scores from Uniswap V3 QuoterV2 on Base. Returns USD prices for ETH, WETH, cbBTC, USDT, DAI, EURC, and more. Costs $0.003 USDC.",
    {
      tokens: z.string().max(500).optional().describe("Comma-separated token symbols (e.g. 'ETH,cbBTC,USDT'). Omit to get all supported token prices."),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ tokens }) => {
      try {
        const res = await api.get("/api/v1/oracle/prices", { params: tokens ? { tokens } : {} });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Oracle prices error: ${error.message}. Try specific tokens: 'ETH,USDC'.` }] };
      }
    }
  );

  server.tool(
    "spraay_oracle_gas",
    "Get current gas prices on Base in gwei. Returns base fee, priority fee, and estimated transaction costs. Costs $0.001 USDC.",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const res = await api.get("/api/v1/oracle/gas");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Oracle gas error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_oracle_fx",
    "Get stablecoin exchange rates with depeg detection. Returns cross-rates between USDC, USDT, DAI, and EURC. Costs $0.002 USDC.",
    {
      base: z.string().optional().describe("Base stablecoin for rate calculation (default: 'USDC'). Options: USDC, USDT, DAI, EURC"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ base: baseCoin }) => {
      try {
        const res = await api.get("/api/v1/oracle/fx", { params: baseCoin ? { base: baseCoin } : {} });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Oracle FX error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Bridge (2 tools)
  // ============================================

  server.tool(
    "spraay_bridge_quote",
    "Get a cross-chain bridge quote via LI.FI aggregator. Supports Base, Ethereum, Arbitrum, Polygon, BNB Chain, Avalanche, Optimism, and more. Returns estimated output, fees, and execution time. Costs $0.005 USDC.",
    {
      fromChain: z.string().min(1).describe("Source chain name (e.g. 'base', 'ethereum', 'arbitrum', 'polygon')"),
      toChain: z.string().min(1).describe("Destination chain name (e.g. 'ethereum', 'arbitrum', 'polygon')"),
      token: z.string().min(1).describe("Token symbol to bridge (e.g. 'USDC', 'ETH')"),
      amount: z.string().min(1).describe("Amount in smallest units (e.g. '1000000' for 1 USDC with 6 decimals)"),
      fromAddress: ethAddr.describe("Sender wallet address on source chain"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ fromChain, toChain, token, amount, fromAddress }) => {
      try {
        const res = await api.get("/api/v1/bridge/quote", { params: { fromChain, toChain, token, amount, fromAddress } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Bridge quote error: ${error.message}. Check supported chains with spraay_bridge_chains.` }] };
      }
    }
  );

  server.tool(
    "spraay_bridge_chains",
    "List all chains supported by the Spraay bridge aggregator (LI.FI). Returns chain names, IDs, and supported tokens. Costs $0.001 USDC.",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const res = await api.get("/api/v1/bridge/chains");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Bridge chains error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Payroll (3 tools)
  // ============================================

  server.tool(
    "spraay_payroll_execute",
    "Execute a payroll batch payment via Spraay V2 contract on Base. Pay up to 200 employees in a single transaction with any stablecoin. Returns unsigned transaction data. Costs $0.02 USDC.",
    {
      token: z.string().min(1).describe("Payment token symbol (e.g. 'USDC', 'USDT', 'DAI')"),
      sender: ethAddr.describe("Employer/sender wallet address"),
      employees: z.array(z.object({
        address: ethAddr.describe("Employee wallet address"),
        amount: z.string().min(1).describe("Payment amount in token units (e.g. '2500' for $2500)"),
        label: z.string().max(100).optional().describe("Employee label/name for record-keeping"),
      })).min(1).max(200).describe("Array of 1-200 employee payment objects"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ token, sender, employees }) => {
      try {
        const res = await api.post("/api/v1/payroll/execute", { token, sender, employees });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Payroll execute error: ${error.message}. Check supported tokens with spraay_payroll_tokens.` }] };
      }
    }
  );

  server.tool(
    "spraay_payroll_estimate",
    "Estimate gas and fees for a payroll batch before executing. Returns estimated gas in wei and USD. Costs $0.002 USDC.",
    {
      employeeCount: z.number().min(1).max(200).describe("Number of employees to pay (1-200)"),
      token: z.string().optional().describe("Payment token symbol (default: 'USDC')"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ employeeCount, token }) => {
      try {
        const res = await api.post("/api/v1/payroll/estimate", { employeeCount, ...(token && { token }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Payroll estimate error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_payroll_tokens",
    "List all stablecoins supported for payroll on Base. Returns symbols, addresses, and decimals. Costs $0.001 USDC.",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const res = await api.get("/api/v1/payroll/tokens");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Payroll tokens error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Invoice (3 tools) — Supabase persistent
  // ============================================

  server.tool(
    "spraay_invoice_create",
    "Create a payment invoice with a pre-encoded ERC-20 transfer transaction. Supports USDC, USDT, DAI, EURC, WETH on Base. Data persists in Supabase. Returns invoice ID, payment instructions, and unsigned tx. Costs $0.005 USDC.",
    {
      creator: ethAddr.describe("Invoice creator/payee wallet address (e.g. '0xYourAddress')"),
      token: z.string().min(1).describe("Payment token symbol (e.g. 'USDC', 'USDT', 'DAI', 'EURC', 'WETH')"),
      amount: positiveAmount.describe("Invoice amount in human-readable units (e.g. '1500.00' for $1500)"),
      recipient: ethAddr.optional().describe("Payer address — omit for open invoice (anyone can pay)"),
      memo: z.string().max(500).optional().describe("Invoice description/memo (e.g. 'Web development - March 2026')"),
      dueDate: z.string().optional().describe("Payment deadline in ISO 8601 format (e.g. '2026-04-15')"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ creator, token, amount, recipient, memo, dueDate }) => {
      try {
        const res = await api.post("/api/v1/invoice/create", { creator, token, amount, ...(recipient && { recipient }), ...(memo && { memo }), ...(dueDate && { dueDate }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Invoice create error: ${error.message}. Supported tokens: USDC, USDT, DAI, EURC, WETH.` }] };
      }
    }
  );

  server.tool(
    "spraay_invoice_list",
    "List invoices by creator or payer address with optional status filter. Data persists in Supabase. Costs $0.002 USDC.",
    {
      address: ethAddr.describe("Creator or payer address to filter by (e.g. '0xYourAddress')"),
      status: z.enum(["pending", "paid", "expired", "cancelled"]).optional().describe("Filter by invoice status"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ address, status }) => {
      try {
        const res = await api.get("/api/v1/invoice/list", { params: { address, ...(status && { status }) } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Invoice list error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_invoice_get",
    "Look up a specific invoice by ID. Returns full invoice details, on-chain balance check, and payment status. Data persists in Supabase. Costs $0.001 USDC.",
    {
      id: z.string().min(1).describe("Invoice ID (e.g. 'INV-A1B2C3D4E5F6')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ id }) => {
      try {
        const res = await api.get(`/api/v1/invoice/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Invoice get error: ${error.message}. Check invoice ID format: INV-XXXX.` }] };
      }
    }
  );

  // ============================================
  // Analytics (2 tools)
  // ============================================

  server.tool(
    "spraay_analytics_wallet",
    "Get a comprehensive wallet profile including ETH + token balances, wallet age, entity classification, and portfolio breakdown on Base. Costs $0.005 USDC.",
    {
      address: ethAddr.describe("Wallet address to analyze (e.g. '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ address }) => {
      try {
        const res = await api.get("/api/v1/analytics/wallet", { params: { address } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Wallet analytics error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_analytics_txhistory",
    "Get decoded transaction history for any address on Base. Returns transaction types, values, timestamps, and decoded method calls. Costs $0.003 USDC.",
    {
      address: ethAddr.describe("Wallet address to get history for"),
      limit: z.string().optional().describe("Max transactions to return (default: '10', max: '100')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ address, limit }) => {
      try {
        const res = await api.get("/api/v1/analytics/txhistory", { params: { address, ...(limit && { limit }) } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `TX history error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Escrow (6 tools) — Supabase persistent
  // ============================================

  server.tool(
    "spraay_escrow_create",
    "Create a conditional escrow with optional milestones, arbiter, and expiry on Base. Funds are held until release conditions are met. Data persists in Supabase. Returns escrow ID and next-step actions. Costs $0.008 USDC.",
    {
      depositor: ethAddr.describe("Depositor/client address who will fund the escrow"),
      beneficiary: ethAddr.describe("Beneficiary/freelancer address who receives funds on release"),
      token: z.string().min(1).describe("Token symbol (e.g. 'USDC', 'USDT', 'DAI', 'EURC', 'WETH')"),
      amount: positiveAmount.describe("Escrow amount in human-readable units (e.g. '5000.00')"),
      arbiter: ethAddr.optional().describe("Optional third-party arbiter who can release or cancel"),
      conditions: z.array(z.string().min(1).max(500)).max(20).optional().describe("Milestone conditions (e.g. ['Design approved', 'Dev complete'])"),
      expiresIn: z.number().min(1).max(8760).optional().describe("Expiry in hours (1-8760, default: 168 = 7 days)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ depositor, beneficiary, token, amount, arbiter, conditions, expiresIn }) => {
      try {
        const res = await api.post("/api/v1/escrow/create", { depositor, beneficiary, token, amount, ...(arbiter && { arbiter }), ...(conditions && { conditions }), ...(expiresIn && { expiresIn }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Escrow create error: ${error.message}. Depositor and beneficiary must be different addresses.` }] };
      }
    }
  );

  server.tool(
    "spraay_escrow_list",
    "List escrows by address (depositor, beneficiary, or arbiter) with optional status filter. Data persists in Supabase. Costs $0.002 USDC.",
    {
      address: ethAddr.describe("Address to list escrows for (depositor, beneficiary, or arbiter)"),
      status: z.enum(["created", "funded", "released", "cancelled", "expired"]).optional().describe("Filter by escrow status"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ address, status }) => {
      try {
        const res = await api.get("/api/v1/escrow/list", { params: { address, ...(status && { status }) } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Escrow list error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_escrow_get",
    "Get full escrow details including status, participants, conditions, balance check, and timestamps by ID. Data persists in Supabase. Costs $0.001 USDC.",
    {
      id: z.string().min(1).describe("Escrow ID (e.g. 'ESC-A1B2C3D4E5F6')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ id }) => {
      try {
        const res = await api.get(`/api/v1/escrow/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Escrow get error: ${error.message}. Check ID format: ESC-XXXX.` }] };
      }
    }
  );

  server.tool(
    "spraay_escrow_fund",
    "Mark an escrow as funded. Changes status from 'created' to 'funded'. Only works on unfunded, non-expired escrows. Data persists in Supabase. Costs $0.002 USDC.",
    {
      escrowId: z.string().min(1).describe("Escrow ID to fund (e.g. 'ESC-A1B2C3D4E5F6')"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ escrowId }) => {
      try {
        const res = await api.post("/api/v1/escrow/fund", { escrowId });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Escrow fund error: ${error.message}. Escrow must be in 'created' status.` }] };
      }
    }
  );

  server.tool(
    "spraay_escrow_release",
    "Release escrow funds to the beneficiary. Returns an unsigned ERC-20 transfer transaction for the depositor to sign. Only depositor or arbiter can release. Data persists in Supabase. Costs $0.005 USDC.",
    {
      escrowId: z.string().min(1).describe("Escrow ID to release (e.g. 'ESC-A1B2C3D4E5F6')"),
      caller: ethAddr.describe("Caller address — must be depositor or arbiter"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ escrowId, caller }) => {
      try {
        const res = await api.post("/api/v1/escrow/release", { escrowId, caller });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Escrow release error: ${error.message}. Only depositor or arbiter can release.` }] };
      }
    }
  );

  server.tool(
    "spraay_escrow_cancel",
    "Cancel an escrow. Depositor can cancel unfunded escrows; depositor or arbiter can cancel funded ones. Data persists in Supabase. Costs $0.002 USDC.",
    {
      escrowId: z.string().min(1).describe("Escrow ID to cancel (e.g. 'ESC-A1B2C3D4E5F6')"),
      caller: ethAddr.describe("Caller address — must be depositor (or arbiter for funded escrows)"),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    async ({ escrowId, caller }) => {
      try {
        const res = await api.post("/api/v1/escrow/cancel", { escrowId, caller });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Escrow cancel error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Inference (4 tools)
  // ============================================

  server.tool(
    "spraay_classify_address",
    "AI-powered wallet classification with risk scoring. Analyzes on-chain activity to classify addresses as whale, retail, MEV bot, exchange, bridge, or contract. Returns risk score, classification, confidence, and behavioral signals. Costs $0.008 USDC.",
    {
      address: ethAddr.describe("Ethereum/Base address to classify (e.g. '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ address }) => {
      try {
        const res = await api.post("/api/v1/inference/classify-address", { address });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Address classification error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_classify_tx",
    "AI-powered transaction classification with risk scoring. Decodes, categorizes, and analyzes any Base transaction. Returns type (swap, transfer, contract call, etc.), risk level, and decoded parameters. Costs $0.008 USDC.",
    {
      hash: txHash.describe("Transaction hash to classify (e.g. '0xabc123...')"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ hash }) => {
      try {
        const res = await api.post("/api/v1/inference/classify-tx", { hash });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `TX classification error: ${error.message}. Ensure hash is a valid 0x-prefixed 64-char hex string.` }] };
      }
    }
  );

  server.tool(
    "spraay_explain_contract",
    "AI-powered smart contract analysis. Explains what a verified contract does, lists its functions, identifies patterns (ERC-20, ERC-721, etc.), and flags security properties. Costs $0.01 USDC.",
    {
      address: ethAddr.describe("Contract address to analyze on Base (e.g. '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' for USDC)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ address }) => {
      try {
        const res = await api.post("/api/v1/inference/explain-contract", { address });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Contract explain error: ${error.message}. Contract must be verified on BaseScan.` }] };
      }
    }
  );

  server.tool(
    "spraay_summarize",
    "AI intelligence briefing for any wallet address or transaction hash. Returns structured risk assessment, entity classification, activity summary, and actionable insights. Costs $0.008 USDC.",
    {
      target: z.string().min(1).describe("Address (0x..., 40 hex chars) or transaction hash (0x..., 64 hex chars) to summarize"),
      context: z.string().optional().describe("Context hint to improve analysis (e.g. 'defi', 'nft', 'governance', 'bridge', 'mev')"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ target, context }) => {
      try {
        const res = await api.post("/api/v1/inference/summarize", { target, ...(context && { context }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Summarize error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Communication — Email/SMS (3 tools)
  // ============================================

  server.tool(
    "spraay_notify_email",
    "Send an email notification via AgentMail for payment confirmations, alerts, receipts, or general communication. Supports subject, CC, and reply-to. Costs $0.003 USDC.",
    {
      to: z.string().email("Must be a valid email address").describe("Recipient email address (e.g. 'user@example.com')"),
      subject: z.string().max(200).optional().describe("Email subject line"),
      body: z.string().min(1).max(10000).describe("Email body content (plain text or HTML)"),
      cc: z.string().email().optional().describe("CC email address"),
      replyTo: z.string().email().optional().describe("Reply-to email address"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ to, subject, body, cc, replyTo }) => {
      try {
        const res = await api.post("/api/v1/notify/email", { to, body, ...(subject && { subject }), ...(cc && { cc }), ...(replyTo && { replyTo }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Email error: ${error.message}. Verify recipient address format.` }] };
      }
    }
  );

  server.tool(
    "spraay_notify_sms",
    "Send an SMS notification for payment alerts (simulated — Twilio integration coming). Requires E.164 phone format. Costs $0.005 USDC.",
    {
      to: z.string().regex(/^\+[1-9]\d{1,14}$/, "Must be E.164 format (e.g. +14155551234)").describe("Phone number in E.164 format (e.g. '+14155551234')"),
      body: z.string().min(1).max(1600).describe("SMS message body (max 1600 characters)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ to, body }) => {
      try {
        const res = await api.post("/api/v1/notify/sms", { to, body });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `SMS error: ${error.message}. Use E.164 format: +14155551234.` }] };
      }
    }
  );

  server.tool(
    "spraay_notify_status",
    "Check delivery status of a previously sent email or SMS notification by notification ID. Costs $0.001 USDC.",
    {
      id: z.string().min(1).describe("Notification ID returned from spraay_notify_email or spraay_notify_sms (e.g. 'ntf_abc123')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ id }) => {
      try {
        const res = await api.get("/api/v1/notify/status", { params: { id } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Notify status error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Communication — Webhook (4 tools) — Supabase persistent
  // ============================================

  server.tool(
    "spraay_webhook_register",
    "Register a webhook endpoint to receive real-time POST events for payments, escrows, swaps, invoices, and more. Returns webhook ID and HMAC secret for signature verification. Data persists in Supabase. Costs $0.003 USDC.",
    {
      url: z.string().url("Must be a valid HTTPS URL").describe("Webhook URL to receive POST events (e.g. 'https://yourapp.com/webhook')"),
      events: z.array(z.string().min(1)).min(1).max(20).describe("Events to subscribe to (e.g. ['payment.sent', 'escrow.funded', 'swap.completed'])"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ url, events }) => {
      try {
        const res = await api.post("/api/v1/webhook/register", { url, events });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Webhook register error: ${error.message}. URL must be a valid HTTPS endpoint.` }] };
      }
    }
  );

  server.tool(
    "spraay_webhook_test",
    "Send a test ping event to a registered webhook to verify delivery and signature validation. Data persists in Supabase. Costs $0.002 USDC.",
    {
      webhookId: z.string().min(1).describe("Webhook ID to test (e.g. 'whk_abc123')"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ webhookId }) => {
      try {
        const res = await api.post("/api/v1/webhook/test", { webhookId });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Webhook test error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_webhook_list",
    "List all registered webhooks with their status, subscribed events, and delivery stats. Data persists in Supabase. Costs $0.001 USDC.",
    {
      status: z.enum(["active", "paused", "failed"]).optional().describe("Filter by webhook status"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ status }) => {
      try {
        const res = await api.get("/api/v1/webhook/list", { params: status ? { status } : {} });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Webhook list error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_webhook_delete",
    "Delete a registered webhook by ID. Removes it permanently from Supabase. Costs $0.001 USDC.",
    {
      webhookId: z.string().min(1).describe("Webhook ID to delete (e.g. 'whk_abc123')"),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    async ({ webhookId }) => {
      try {
        const res = await api.post("/api/v1/webhook/delete", { webhookId });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Webhook delete error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Communication — XMTP (2 tools)
  // ============================================

  server.tool(
    "spraay_xmtp_send",
    "Send an encrypted XMTP message to any Ethereum address on the XMTP production network. Messages are end-to-end encrypted. Costs $0.003 USDC.",
    {
      to: ethAddr.describe("Recipient Ethereum address (must have XMTP enabled)"),
      content: z.string().min(1).max(10000).describe("Message content to send"),
      contentType: z.string().optional().describe("Content type (default: 'text/plain')"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ to, content, contentType }) => {
      try {
        const res = await api.post("/api/v1/xmtp/send", { to, content, ...(contentType && { contentType }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `XMTP send error: ${error.message}. Recipient must have XMTP enabled.` }] };
      }
    }
  );

  server.tool(
    "spraay_xmtp_inbox",
    "Read XMTP inbox messages for an Ethereum address. Returns decrypted messages from the production XMTP network. Costs $0.002 USDC.",
    {
      address: ethAddr.describe("Ethereum address to check inbox for"),
      limit: z.string().optional().describe("Max messages to return (default: '20', max: '100')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ address, limit }) => {
      try {
        const res = await api.get("/api/v1/xmtp/inbox", { params: { address, ...(limit && { limit }) } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `XMTP inbox error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Infrastructure — RPC (2 tools)
  // ============================================

  server.tool(
    "spraay_rpc_call",
    "Make a premium multi-chain JSON-RPC call via Alchemy (EVM) or Helius (Solana). Supports Base, Ethereum, Arbitrum, Polygon, BNB Chain, Avalanche, and Solana. Costs $0.001 USDC.",
    {
      chain: z.string().min(1).describe("Chain identifier (e.g. 'base', 'ethereum', 'arbitrum', 'polygon', 'bnb', 'avalanche', 'solana')"),
      method: z.string().min(1).describe("JSON-RPC method (e.g. 'eth_getBalance', 'eth_blockNumber', 'eth_call', 'eth_getTransactionReceipt')"),
      params: z.array(z.any()).optional().describe("RPC method parameters as array (e.g. ['0xAddress', 'latest'])"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ chain, method, params }) => {
      try {
        const res = await api.post("/api/v1/rpc/call", { chain, method, ...(params && { params }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `RPC call error: ${error.message}. Check supported chains with spraay_rpc_chains.` }] };
      }
    }
  );

  server.tool(
    "spraay_rpc_chains",
    "List all chains supported by the Spraay RPC proxy and their allowed JSON-RPC methods. Costs $0.001 USDC.",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const res = await api.get("/api/v1/rpc/chains");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `RPC chains error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Infrastructure — IPFS/Arweave (3 tools)
  // ============================================

  server.tool(
    "spraay_storage_pin",
    "Pin content to IPFS via Pinata for permanent decentralized storage. Returns CID (content identifier) for retrieval. Supports text, JSON, and base64 data. Costs $0.005 USDC.",
    {
      data: z.string().min(1).max(5000000).describe("Content to pin — JSON string, plain text, or base64-encoded binary"),
      contentType: z.string().optional().describe("MIME type (default: 'application/octet-stream', e.g. 'application/json', 'text/plain')"),
      provider: z.enum(["ipfs", "arweave"]).optional().describe("Storage provider (default: 'ipfs')"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ data, contentType, provider }) => {
      try {
        const res = await api.post("/api/v1/storage/pin", { data, ...(contentType && { contentType }), ...(provider && { provider }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Storage pin error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_storage_get",
    "Retrieve previously pinned content from IPFS/Arweave by CID. Returns the stored data. Costs $0.002 USDC.",
    {
      cid: z.string().min(1).describe("Content identifier (CID) to retrieve (e.g. 'QmXoypizj...' or 'bafybeig...')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ cid }) => {
      try {
        const res = await api.get("/api/v1/storage/get", { params: { cid } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Storage get error: ${error.message}. Verify the CID is correct.` }] };
      }
    }
  );

  server.tool(
    "spraay_storage_status",
    "Check the pin status of a storage request by pin ID. Returns pinning progress and confirmation. Costs $0.001 USDC.",
    {
      id: z.string().min(1).describe("Pin request ID (e.g. 'pin_abc123')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ id }) => {
      try {
        const res = await api.get("/api/v1/storage/status", { params: { id } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Storage status error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Infrastructure — Cron/Scheduler (3 tools) — Supabase persistent
  // ============================================

  server.tool(
    "spraay_cron_create",
    "Create a scheduled job for recurring payments, DCA strategies, reminders, or any gateway action. Supports standard 5-part cron expressions. Data persists in Supabase. Costs $0.005 USDC.",
    {
      action: z.string().min(1).describe("Gateway action to schedule (e.g. 'batch.execute', 'swap.execute', 'notify.email', 'payroll.execute', 'xmtp.send')"),
      schedule: z.string().regex(/^(\S+\s){4}\S+$/, "Must be 5-part cron: min hour dom mon dow").describe("Cron expression (e.g. '0 9 * * 1' for every Monday at 9am)"),
      payload: z.record(z.string(), z.any()).describe("Payload for the scheduled action (same format as the action's direct API call)"),
      maxRuns: z.number().min(1).max(10000).optional().describe("Max executions before auto-cancel (omit for unlimited)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ action, schedule, payload, maxRuns }) => {
      try {
        const res = await api.post("/api/v1/cron/create", { action, schedule, payload, ...(maxRuns && { maxRuns }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Cron create error: ${error.message}. Use 5-part cron format: min hour dom mon dow.` }] };
      }
    }
  );

  server.tool(
    "spraay_cron_list",
    "List all scheduled jobs with optional status and action filters. Data persists in Supabase. Costs $0.001 USDC.",
    {
      status: z.enum(["active", "paused", "cancelled", "completed"]).optional().describe("Filter by job status"),
      action: z.string().optional().describe("Filter by action type (e.g. 'batch.execute')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ status, action }) => {
      try {
        const res = await api.get("/api/v1/cron/list", { params: { ...(status && { status }), ...(action && { action }) } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Cron list error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_cron_cancel",
    "Cancel a scheduled job by ID. Stops future executions. Data persists in Supabase. Costs $0.001 USDC.",
    {
      jobId: z.string().min(1).describe("Cron job ID to cancel (e.g. 'cron_abc123')"),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    async ({ jobId }) => {
      try {
        const res = await api.post("/api/v1/cron/cancel", { jobId });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Cron cancel error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Infrastructure — Logging (2 tools) — Supabase persistent
  // ============================================

  server.tool(
    "spraay_logs_ingest",
    "Ingest structured logs for debugging and monitoring agent workflows. Accepts up to 100 entries per batch. Data persists in Supabase. Costs $0.001 USDC.",
    {
      entries: z.array(z.object({
        level: z.enum(["debug", "info", "warn", "error"]).describe("Log level"),
        service: z.string().min(1).max(100).describe("Service name (e.g. 'batch-agent', 'swap-bot', 'payroll-scheduler')"),
        message: z.string().min(1).max(2000).describe("Log message"),
        data: z.record(z.string(), z.any()).optional().describe("Additional structured data as key-value pairs"),
      })).min(1).max(100).describe("Array of 1-100 log entries"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ entries }) => {
      try {
        const res = await api.post("/api/v1/logs/ingest", { entries });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Logs ingest error: ${error.message}. Max 100 entries per batch.` }] };
      }
    }
  );

  server.tool(
    "spraay_logs_query",
    "Query structured logs by service, level, and time range. Returns matching log entries sorted newest first. Data persists in Supabase. Costs $0.003 USDC.",
    {
      service: z.string().optional().describe("Filter by service name (e.g. 'batch-agent')"),
      level: z.enum(["debug", "info", "warn", "error"]).optional().describe("Filter by log level"),
      since: z.string().optional().describe("Start time in ISO 8601 format (e.g. '2026-03-01T00:00:00Z')"),
      limit: z.string().optional().describe("Max results to return (default: '50', max: '500')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ service, level, since, limit }) => {
      try {
        const res = await api.get("/api/v1/logs/query", { params: { ...(service && { service }), ...(level && { level }), ...(since && { since }), ...(limit && { limit }) } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Logs query error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Identity & Access — KYC (2 tools) — Supabase persistent
  // ============================================

  server.tool(
    "spraay_kyc_verify",
    "Initiate KYC/KYB verification for compliance-gated payments. Supports individual and business verification at basic, enhanced, or full levels. Data persists in Supabase. Costs $0.05 USDC.",
    {
      address: ethAddr.describe("Ethereum address to verify"),
      type: z.enum(["individual", "business"]).optional().describe("Verification type (default: 'individual')"),
      level: z.enum(["basic", "enhanced", "full"]).optional().describe("Verification level (default: 'basic')"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ address, type, level }) => {
      try {
        const res = await api.post("/api/v1/kyc/verify", { address, ...(type && { type }), ...(level && { level }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `KYC verify error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_kyc_status",
    "Check KYC verification status by record ID or wallet address. Returns verification level, check results, and expiry. Data persists in Supabase. Costs $0.005 USDC.",
    {
      id: z.string().optional().describe("KYC record ID (e.g. 'kyc_abc123')"),
      address: ethAddr.optional().describe("Ethereum address for lookup (alternative to ID)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ id, address }) => {
      try {
        const res = await api.get("/api/v1/kyc/status", { params: { ...(id && { id }), ...(address && { address }) } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `KYC status error: ${error.message}. Provide either id or address.` }] };
      }
    }
  );

  // ============================================
  // Identity & Access — Auth/SSO (2 tools) — Supabase persistent
  // ============================================

  server.tool(
    "spraay_auth_session",
    "Create an authenticated session with scoped permissions and configurable TTL. Returns a session token (spr_...) for use in Authorization headers. Data persists in Supabase. Costs $0.005 USDC.",
    {
      address: ethAddr.describe("Ethereum address to create session for"),
      permissions: z.array(z.string()).optional().describe("Scoped permissions array (e.g. ['batch:execute', 'swap:execute']). Omit or pass ['*'] for all permissions."),
      ttlSeconds: z.number().min(60).max(86400).optional().describe("Session TTL in seconds (60-86400, default: 3600 = 1 hour)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ address, permissions, ttlSeconds }) => {
      try {
        const res = await api.post("/api/v1/auth/session", { address, ...(permissions && { permissions }), ...(ttlSeconds && { ttlSeconds }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Auth session error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_auth_verify",
    "Verify a session token and check its permissions, expiry, and associated address. Data persists in Supabase. Costs $0.001 USDC.",
    {
      token: z.string().min(1).describe("Session token to verify (e.g. 'spr_abc123...')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ token }) => {
      try {
        const res = await api.get("/api/v1/auth/verify", { params: { token } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Auth verify error: ${error.message}. Token may be expired or invalid.` }] };
      }
    }
  );

  // ============================================
  // Compliance — Audit Trail (2 tools) — Supabase persistent
  // ============================================

  server.tool(
    "spraay_audit_log",
    "Record an immutable audit trail entry for payments, escrows, compliance actions, and other events. Data persists in Supabase. Costs $0.001 USDC.",
    {
      action: z.string().min(1).describe("Action type (e.g. 'payment.sent', 'escrow.created', 'kyc.completed', 'auth.session_created')"),
      actor: ethAddr.describe("Actor wallet address who performed the action"),
      resource: z.string().min(1).describe("Resource identifier (e.g. 'batch_123', 'ESC-A1B2', 'INV-C3D4')"),
      details: z.record(z.string(), z.any()).optional().describe("Additional details as key-value pairs"),
      txHash: txHash.optional().describe("Related on-chain transaction hash"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ action, actor, resource, details, txHash }) => {
      try {
        const res = await api.post("/api/v1/audit/log", { action, actor, resource, ...(details && { details }), ...(txHash && { txHash }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Audit log error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_audit_query",
    "Query the audit trail by actor, action, resource, or time range. Returns matching entries sorted newest first. Data persists in Supabase. Costs $0.005 USDC.",
    {
      actor: ethAddr.optional().describe("Filter by actor wallet address"),
      action: z.string().optional().describe("Filter by action type (e.g. 'payment.sent')"),
      resource: z.string().optional().describe("Filter by resource identifier (partial match)"),
      since: z.string().optional().describe("Start time in ISO 8601 (e.g. '2026-03-01T00:00:00Z')"),
      until: z.string().optional().describe("End time in ISO 8601"),
      limit: z.string().optional().describe("Max results (default: '50', max: '500')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ actor, action, resource, since, until, limit }) => {
      try {
        const res = await api.get("/api/v1/audit/query", { params: { ...(actor && { actor }), ...(action && { action }), ...(resource && { resource }), ...(since && { since }), ...(until && { until }), ...(limit && { limit }) } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Audit query error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Compliance — Tax (2 tools) — Supabase persistent
  // ============================================

  server.tool(
    "spraay_tax_calculate",
    "Calculate crypto tax gain/loss using FIFO method for up to 500 transactions. Returns per-event breakdown and aggregate summary with short/long-term classification. Data persists in Supabase. Costs $0.01 USDC.",
    {
      transactions: z.array(z.object({
        type: z.string().optional().describe("Transaction type: 'swap', 'send', 'receive', 'bridge', 'payroll', 'escrow_release'"),
        asset: z.string().optional().describe("Asset symbol (e.g. 'ETH', 'USDC')"),
        amount: z.number().optional().describe("Amount of asset"),
        costBasisUsd: z.number().optional().describe("Cost basis in USD"),
        proceedsUsd: z.number().optional().describe("Proceeds in USD"),
        holdingDays: z.number().min(0).optional().describe("Days held (>365 = long-term capital gains)"),
        txHash: z.string().optional().describe("Transaction hash for record-keeping"),
        timestamp: z.string().optional().describe("Transaction timestamp in ISO 8601"),
      })).min(1).max(500).describe("Array of 1-500 transaction objects for tax calculation"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ transactions }) => {
      try {
        const res = await api.post("/api/v1/tax/calculate", { transactions });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Tax calculate error: ${error.message}. Max 500 transactions per batch.` }] };
      }
    }
  );

  server.tool(
    "spraay_tax_report",
    "Retrieve a previously calculated tax report by ID, or list all reports. Data persists in Supabase. Costs $0.02 USDC.",
    {
      reportId: z.string().optional().describe("Tax report ID from spraay_tax_calculate (e.g. 'tax_abc123'). Omit to list all reports."),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ reportId }) => {
      try {
        const res = await api.get("/api/v1/tax/report", { params: reportId ? { reportId } : {} });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Tax report error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // GPU/Compute (3 tools)
  // ============================================

  server.tool(
    "spraay_gpu_run",
    "Run AI model inference on GPU via Replicate. Supports image generation (flux-pro, sdxl, ideogram), video generation (wan-video, minimax-video), LLMs (llama-70b, llama-8b, mixtral), audio (whisper transcription, musicgen), and utilities (esrgan upscaling, rembg background removal). Use shortcuts like 'flux-pro' or full model IDs like 'owner/model'. Returns output directly for fast models, or a poll URL for longer jobs. Costs $0.05 USDC.",
    {
      model: z.string().min(1).describe("Model shortcut (flux-pro, sdxl, llama-70b, whisper, esrgan, etc.) or full Replicate model ID (owner/model-name). Use spraay_gpu_models to list all shortcuts."),
      input: z.record(z.string(), z.any()).describe("Model-specific input parameters. Image models: { prompt: '...' }. LLMs: { prompt: '...' }. Whisper: { audio: 'https://...' }. ESRGAN: { image: 'https://...' }."),
      version: z.string().optional().describe("Specific model version hash (optional — not needed for official models)"),
      webhook: z.string().optional().describe("Webhook URL for async result delivery (optional)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ model, input, version, webhook }) => {
      try {
        const res = await api.post("/api/v1/gpu/run", { model, input, ...(version && { version }), ...(webhook && { webhook }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `GPU run error: ${error.message}. Check model shortcuts with spraay_gpu_models.` }] };
      }
    }
  );

  server.tool(
    "spraay_gpu_status",
    "Check the status of a GPU prediction by ID. Use this to poll for results on longer-running jobs like video generation or large model inference. Returns output when complete. Costs $0.002 USDC.",
    {
      id: z.string().min(1).describe("Prediction ID returned from spraay_gpu_run"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ id }) => {
      try {
        const res = await api.get(`/api/v1/gpu/status/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `GPU status error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_gpu_models",
    "List all available GPU model shortcuts grouped by category (image, video, LLM, audio, utility). Shows shortcut names, full Replicate model IDs, and descriptions. You can also use any Replicate model by its full ID. FREE — no USDC cost.",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const res = await api.get("/api/v1/gpu/models");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `GPU models error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Search/RAG (3 tools)
  // ============================================

  server.tool(
    "spraay_search_web",
    "Search the web and get clean, LLM-ready results via Tavily. Returns extracted content (not just links), plus an AI-generated answer. Supports basic and advanced search depth, domain filtering, and topic focus (general, news, finance). Costs $0.01 USDC.",
    {
      query: z.string().min(1).max(2000).describe("Search query (e.g. 'latest Base ecosystem developments', 'x402 protocol explained')"),
      search_depth: z.enum(["basic", "advanced"]).optional().describe("Search depth: 'basic' (fast, default) or 'advanced' (deeper extraction, better results)"),
      max_results: z.number().min(1).max(20).optional().describe("Number of results to return (default: 5, max: 20)"),
      topic: z.enum(["general", "news", "finance"]).optional().describe("Topic focus: 'general' (default), 'news' (recent events), 'finance' (markets/crypto)"),
      include_domains: z.array(z.string()).optional().describe("Only include results from these domains (e.g. ['docs.base.org', 'ethereum.org'])"),
      exclude_domains: z.array(z.string()).optional().describe("Exclude results from these domains"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ query, search_depth, max_results, topic, include_domains, exclude_domains }) => {
      try {
        const res = await api.post("/api/v1/search/web", {
          query,
          ...(search_depth && { search_depth }),
          ...(max_results && { max_results }),
          ...(topic && { topic }),
          ...(include_domains && { include_domains }),
          ...(exclude_domains && { exclude_domains }),
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Search error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_search_extract",
    "Extract clean, structured content from specific URLs — perfect for RAG pipelines. Returns the full text content of each page, ready for LLM consumption. Up to 5 URLs per request. Costs $0.015 USDC.",
    {
      urls: z.array(z.string().url()).min(1).max(5).describe("Array of 1-5 URLs to extract content from (e.g. ['https://docs.base.org/overview'])"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ urls }) => {
      try {
        const res = await api.post("/api/v1/search/extract", { urls });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Extract error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_search_qna",
    "Ask a question and get a direct, synthesized answer with cited sources. Searches the web, extracts relevant content, and generates a comprehensive answer. Great for research and fact-checking. Costs $0.02 USDC.",
    {
      query: z.string().min(1).max(2000).describe("Natural language question (e.g. 'What is x402 protocol and how does it work?')"),
      topic: z.enum(["general", "news", "finance"]).optional().describe("Topic focus: 'general' (default), 'news', 'finance'"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ query, topic }) => {
      try {
        const res = await api.post("/api/v1/search/qna", { query, ...(topic && { topic }) });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Q&A error: ${error.message}.` }] };
      }
    }
  );

  // ============================================
  // Data (3 tools)
  // ============================================

  server.tool(
    "spraay_prices",
    "Get live on-chain token prices on Base from Uniswap V3 pools. Returns USD prices with timestamps. Costs $0.002 USDC.",
    {
      token: z.string().optional().describe("Specific token symbol (e.g. 'WETH', 'cbBTC'). Omit to get all supported token prices."),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ token }) => {
      try {
        const res = await api.get("/api/v1/prices", { params: token ? { token } : {} });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Prices error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_balances",
    "Get ETH + ERC-20 token balances for any wallet on Base. Returns formatted balances with USD values where available. Costs $0.002 USDC.",
    {
      address: ethAddr.describe("Wallet address to check (e.g. '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')"),
      tokens: z.string().optional().describe("Comma-separated custom ERC-20 contract addresses to include"),
      showAll: z.enum(["true", "false"]).optional().describe("Set to 'true' to include zero balances"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ address, tokens, showAll }) => {
      try {
        const res = await api.get("/api/v1/balances", { params: { address, ...(tokens && { tokens }), ...(showAll && { showAll }) } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Balances error: ${error.message}.` }] };
      }
    }
  );

  server.tool(
    "spraay_resolve",
    "Resolve ENS names (.eth) and Basenames (.base.eth) to wallet addresses, or perform reverse lookup from address to name. Costs $0.001 USDC.",
    {
      name: z.string().min(1).describe("ENS name (e.g. 'vitalik.eth'), Basename (e.g. 'satoshi.base.eth'), or address for reverse lookup (e.g. '0xd8dA...')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ name }) => {
      try {
        const res = await api.get("/api/v1/resolve", { params: { name } });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Resolve error: ${error.message}. Provide an ENS name, Basename, or 0x address.` }] };
      }
    }
  );

  // ============================================
  // RESOURCES — Static data for agent context
  // ============================================

  server.resource(
    "gateway-info",
    "spraay://gateway/info",
    { description: "Spraay x402 Gateway metadata — version, endpoints, supported chains, and pricing overview" },
    async () => ({
      contents: [{
        uri: "spraay://gateway/info",
        mimeType: "application/json",
        text: JSON.stringify({
          name: "Spraay x402 Gateway", version: "3.3.0", gateway: "https://gateway.spraay.app",
          network: "Base (eip155:8453)", paymentToken: "USDC", totalTools: 63, activeTools: 62,
          categories: ["AI", "Payments", "Swap", "Oracle", "Bridge", "Payroll", "Invoice", "Analytics", "Escrow", "Inference", "Communication", "Infrastructure", "Identity", "Compliance", "Data", "GPU/Compute", "Search/RAG"],
          persistence: "Supabase Postgres", protocol: "x402", facilitator: "Coinbase CDP",
        }, null, 2),
      }],
    })
  );

  server.resource(
    "supported-tokens",
    "spraay://tokens/list",
    { description: "All tokens supported by Spraay for payments, swaps, and escrow on Base" },
    async () => ({
      contents: [{
        uri: "spraay://tokens/list",
        mimeType: "application/json",
        text: JSON.stringify({
          tokens: [
            { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
            { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
            { symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
            { symbol: "EURC", address: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", decimals: 6 },
            { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
            { symbol: "ETH", address: "native", decimals: 18 },
          ],
          chain: "Base (8453)",
        }, null, 2),
      }],
    })
  );

  server.resource(
    "supported-chains",
    "spraay://chains/list",
    { description: "All 11 chains supported by Spraay batch payments protocol" },
    async () => ({
      contents: [{
        uri: "spraay://chains/list",
        mimeType: "application/json",
        text: JSON.stringify({
          chains: [
            { name: "Base", chainId: 8453, status: "live", gateway: true },
            { name: "Ethereum", chainId: 1, status: "live" },
            { name: "Arbitrum", chainId: 42161, status: "live" },
            { name: "Polygon", chainId: 137, status: "live" },
            { name: "BNB Chain", chainId: 56, status: "live" },
            { name: "Avalanche", chainId: 43114, status: "live" },
            { name: "Unichain", chainId: 130, status: "live" },
            { name: "Plasma", chainId: 7777777, status: "live" },
            { name: "BOB", chainId: 60808, status: "live" },
            { name: "Solana", chainId: null, status: "live" },
            { name: "Bittensor", chainId: null, status: "live" },
          ],
          total: 11,
        }, null, 2),
      }],
    })
  );
// ============================================
  // PROMPTS — Guided workflow templates
  // ============================================

  server.prompt(
    "analyze-wallet",
    "Comprehensive wallet analysis: classification, balances, risk scoring, and transaction history",
    { address: z.string().describe("Ethereum/Base wallet address to analyze") },
    async ({ address }) => ({
      messages: [{
        role: "user" as const,
        content: { type: "text" as const, text: `Perform a comprehensive analysis of wallet ${address} on Base:\n\n1. Use spraay_analytics_wallet for wallet profile, balances, and classification.\n2. Use spraay_classify_address for AI-powered risk scoring.\n3. Use spraay_analytics_txhistory to review recent transactions.\n4. Use spraay_summarize for an intelligence briefing.\n\nSynthesize into a report: wallet type, risk level, portfolio, notable activity, and flags.` },
      }],
    })
  );

  server.prompt(
    "create-escrow",
    "Step-by-step escrow creation with milestones between depositor and beneficiary",
    {
      depositor: z.string().describe("Depositor/client wallet address"),
      beneficiary: z.string().describe("Beneficiary/freelancer wallet address"),
      amount: z.string().describe("Escrow amount (e.g. 5000.00)"),
      token: z.string().optional().describe("Payment token (default: USDC)"),
    },
    async ({ depositor, beneficiary, amount, token }) => ({
      messages: [{
        role: "user" as const,
        content: { type: "text" as const, text: `Create escrow: ${depositor} → ${beneficiary} for ${amount} ${token || "USDC"}.\n\n1. spraay_escrow_create with conditions.\n2. spraay_escrow_get to confirm.\n3. spraay_escrow_fund when ready.\n4. spraay_audit_log to record.\n\nReturn escrow ID and next steps.` },
      }],
    })
  );

  server.prompt(
    "batch-payroll",
    "Execute payroll with gas estimation and audit logging",
    {
      sender: z.string().describe("Employer wallet address"),
      employeeCount: z.string().describe("Number of employees"),
    },
    async ({ sender, employeeCount }) => ({
      messages: [{
        role: "user" as const,
        content: { type: "text" as const, text: `Payroll for ${employeeCount} employees from ${sender}:\n\n1. spraay_payroll_estimate for gas costs.\n2. spraay_payroll_tokens for stablecoins.\n3. spraay_payroll_execute with employee data.\n4. spraay_audit_log to record.\n5. Optionally spraay_notify_email employees.\n\nSummarize total, gas, and tx details.` },
      }],
    })
  );

  server.prompt(
    "defi-swap",
    "Get a quote and execute a token swap on Base via Uniswap V3",
    {
      tokenIn: z.string().describe("Token to sell (e.g. USDC)"),
      tokenOut: z.string().describe("Token to buy (e.g. WETH)"),
      amount: z.string().describe("Amount to swap"),
    },
    async ({ tokenIn, tokenOut, amount }) => ({
      messages: [{
        role: "user" as const,
        content: { type: "text" as const, text: `Swap ${amount} ${tokenIn} → ${tokenOut}:\n\n1. spraay_swap_quote for expected output and price impact.\n2. spraay_oracle_prices for current prices.\n3. spraay_swap_execute for unsigned tx.\n\nWarn if price impact > 1%.` },
      }],
    })
  );
}

// Sandbox server for Smithery scanning (no real credentials needed)
export function createSandboxServer() {
  const server = new McpServer({
    name: "Spraay x402 Gateway",
    version: "3.3.0",
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
      version: "3.3.0",
      description: "63 MCP tools (62 active) for full-stack DeFi infrastructure on Base with persistent Supabase storage. AI, payments, swaps, oracle, bridge, payroll, invoicing, escrow, inference, analytics, communication, infrastructure, identity, compliance, GPU/Compute & Search/RAG. Agents pay USDC per request via x402 protocol.",
      mcp: "/mcp",
      tools: 63,
      activeTools: 62,
      resources: 3,
      prompts: 4,
      gateway: gatewayURL,
    });
  });

  app.all("/mcp", async (req: any, res: any) => {
    const server = new McpServer({
      name: "Spraay x402 Gateway",
      version: "3.3.0",
    });
    registerTools(server, api);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined as any });
    res.on("close", () => { transport.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(PORT, () => {
    console.log(`\n💧 Spraay MCP Server (HTTP) v3.2.0 running on port ${PORT}`);
    console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`🔗 Gateway: ${gatewayURL}`);
    console.log(`🔧 63 tools (62 active) + 3 resources + 4 prompts\n`);
  });
}

// Stdio transport for Claude Desktop / Cursor
async function startStdioServer(api: any) {
  const server = new McpServer({
    name: "Spraay x402 Gateway",
    version: "3.3.0",
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
  SPRAAY_GATEWAY_URL: z.string().optional().default("https://gateway.spraay.app").describe("Spraay x402 Gateway URL (optional, defaults to https://gateway.spraay.app)"),
});

// Default export: Smithery calls this to create the server
// When deployed on Smithery, config comes from user input
// When running locally, falls back to process.env
export default function createServer({ config }: { config?: z.infer<typeof configSchema> } = {}) {
  const gw = config?.SPRAAY_GATEWAY_URL || process.env.SPRAAY_GATEWAY_URL || "https://gateway.spraay.app";
  const evmKey = config?.EVM_PRIVATE_KEY || process.env.EVM_PRIVATE_KEY;

  const server = new McpServer({
    name: "Spraay",
    version: "3.3.0",
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
