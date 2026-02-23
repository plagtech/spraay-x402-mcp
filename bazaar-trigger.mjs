#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios from "axios";
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { config } from "dotenv";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY;
const gatewayURL = process.env.SPRAAY_GATEWAY_URL || "https://gateway.spraay.app";

if (!evmPrivateKey) {
  console.error("❌ Set EVM_PRIVATE_KEY environment variable");
  process.exit(1);
}

async function createPaymentClient() {
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
  };
  registerExactEvmScheme(client, { signer });
  return wrapAxiosWithPayment(axios.create({ baseURL: gatewayURL }), client);
}

async function main() {
  const api = await createPaymentClient();

  const endpoints = [
    { name: "models",         method: "GET",  path: "/api/v1/models" },
    { name: "tokens",         method: "GET",  path: "/api/v1/swap/tokens" },
    { name: "prices",         method: "GET",  path: "/api/v1/prices" },
    { name: "balances",       method: "GET",  path: "/api/v1/balances?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
    { name: "resolve",        method: "GET",  path: "/api/v1/resolve?name=vitalik.eth" },
    { name: "batch_estimate", method: "POST", path: "/api/v1/batch/estimate", data: { recipientCount: 1 } },
    { name: "swap_quote",     method: "GET",  path: "/api/v1/swap/quote?tokenIn=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&tokenOut=0x4200000000000000000000000000000000000006&amountIn=1000000" },
    { name: "chat",           method: "POST", path: "/api/v1/chat/completions", data: { model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "say ok" }] } },
    { name: "batch_execute",  method: "POST", path: "/api/v1/batch/execute",  data: { token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", recipients: ["0x0000000000000000000000000000000000000001"], amounts: ["1000"], sender: "0xAd62f03C7514bb8c51f1eA70C2b75C37404695c8" } },
  ];

  console.log(`🚀 Triggering Bazaar indexing for ${endpoints.length} endpoints...\n`);

  for (const ep of endpoints) {
    try {
      let res;
      if (ep.method === "GET") {
        res = await api.get(ep.path);
      } else {
        res = await api.post(ep.path, ep.data || {});
      }
      console.log(`✅ ${ep.name.padEnd(16)} — ${res.status} — paid`);
    } catch (err) {
      const status = err.response?.status || "ERR";
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      console.log(`⚠️  ${ep.name.padEnd(16)} — ${status} — ${typeof msg === 'string' ? msg.slice(0, 100) : JSON.stringify(msg).slice(0, 100)}`);
    }
  }

  console.log("\n🏁 Done!");
}

main().catch(console.error);
