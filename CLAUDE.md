# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An MCP server that exposes the **Spraay x402 Gateway** (`https://gateway.spraay.app`) as MCP tools. AI-agent clients (Claude Desktop, Cursor) call a tool, the server forwards to the gateway, the gateway replies `402 Payment Required`, and `@x402/axios` signs a USDC micropayment on Base from the user's wallet before the call returns. No API keys — payment *is* the auth.

The published artifact is the npm package `spraay-x402-mcp` (unscoped; only `dist/`, `README`, `LICENSE` ship — see `npmignore`). It is installed zero-config via `claude mcp add spraay -s user -- npx -y spraay-x402-mcp` — no env vars required.

**Wallet is auto-created**, not configured. `src/wallet.ts#resolveWallet()` resolves the signing key in order: `EVM_PRIVATE_KEY` env (override) → `~/.spraay/.session` (persisted) → freshly generated via viem and persisted (0600). The address is logged to stderr on startup. `src/version-check.ts` does a non-blocking npm-registry check on startup and notes newer versions on stderr.

## Commands

```bash
npm run sync      # regenerate src/auto-tools.ts from the LIVE gateway manifest (needs network)
npm run build     # sync + tsc -> dist/
npm run dev       # tsx src/index.ts (stdio, no build step)
npm start         # node dist/index.js (stdio)
npm run start:http # MCP_TRANSPORT=http node dist/index.js
```

There is **no test suite, linter, or formatter** configured. "Building" always runs `sync` first, so a build requires network access to `gateway.spraay.app`.

## Architecture

Two source files, both large and mostly tool registrations:

- **`src/index.ts`** — entrypoint + ~77 hand-written tools, grouped by category with `// Category (N tools)` comment headers (AI, Payments, DeFi/Swap, Oracle, Bridge, Payroll, Invoice, Escrow, Inference, Communication, Infrastructure, Identity, Compliance, GPU/Compute, Search/RAG, Data, Compute Services). Also defines all transports and Smithery exports.
- **`src/auto-tools.ts`** — **GENERATED, DO NOT EDIT.** Produced by `scripts/sync-tools.mjs`. Header says so. Edits are lost on the next `npm run sync`/`build`.

### The auto-sync mechanism (the core idea)

`scripts/sync-tools.mjs` runs before every build and:
1. Fetches `GET /` (endpoint manifest) and `GET /openapi.json` (typed schemas, best-effort) from the gateway.
2. Regex-scans `src/index.ts` for paths already covered (`api.get("...")`, `api.post(...)`, `url: "..."`). Path params are normalized (`${jobId}` and `:jobId` → `:param`) so a manual tool and a gateway endpoint that differ only in param name don't both register.
3. Emits a tool into `src/auto-tools.ts` for every **uncovered** gateway endpoint. Tool names derive from the path (`deriveToolName`) into the `spraay_<snake_case>` namespace.

**Consequence:** to permanently customize a tool (better description, tighter Zod schema, custom handler logic), add a hand-written `server.tool(...)` for that path in `index.ts`. The sync script will then see the path as covered and stop generating an auto-tool for it. This is the intended override path — never edit `auto-tools.ts`.

`registerTools()` in `index.ts` registers the manual tools and then calls `registerAutoTools()` from the generated file, so both sets share one server.

### Output-schema enhancement layer

`enhanceWithOutputSchema(server)` (top of `registerTools`) monkey-patches `server.tool(...)` to route every registration through the SDK's `registerTool()` with a shared `outputSchema` (`SPRAAY_OUTPUT_SHAPE`: `{ok, data?, error?}`) and to attach a `structuredContent` envelope to every result. This is why no individual handler declares an output schema, yet `tools/list` advertises them (a Smithery requirement). It also snake_case-normalizes tool names at registration time — the same normalization `deriveToolName` applies — so generated names match served names. The original `content` text block is left byte-for-byte unchanged; `structuredContent` is purely additive.

### Transports and entrypoints

`index.ts` has several entrypoints for different hosts — keep them in sync when changing tool registration:
- **stdio** (`startStdioServer`) — default, for Claude Desktop / Cursor. Selected unless `MCP_TRANSPORT=http`.
- **http** (`startHttpServer`) — Express, `POST /mcp` per-request server, plus a `GET /` info page. Used by Docker (`Dockerfile` sets `MCP_TRANSPORT=http`, port 8080) and remote hosting.
- **`default export createServer({config})`** — Smithery calls this; config comes from Smithery UI, falling back to `process.env`.
- **`createSandboxServer()`** — mock API (no key) for Smithery's tool scan.

`main()` only runs (real payment client) when `EVM_PRIVATE_KEY` is set; otherwise http mode starts with a mock axios client.

`bazaar-trigger.mjs` is a standalone one-off script (not part of the server) using the same x402 payment plumbing.

## Conventions

- **Tool names**: `spraay_<snake_case>` derived from the gateway path. Pricing and FREE/paid status come from the gateway manifest, not hardcoded.
- **Handlers**: wrap the axios call in try/catch, return `{ content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] }`, and on error `{ isError: true, content: [...] }`. Match this shape in any new tool.
- **Zod helpers** at the top of both files: `ethAddr`, `txHash`, `positiveAmount`.

## Version / count bookkeeping (easy to get wrong)

The tool count and version are duplicated across many files and must be kept consistent: `package.json`, `meta.json`, `smithery.yaml`, `README.md` (which carries a large HTML comment with the exact sync-and-count procedure), the GitHub repo description, and the `version`/`tools` strings hardcoded in `index.ts`'s http info page and server constructors. The README documents the authoritative recount step:

```bash
npm run sync
# count "server.tool(" occurrences in src/auto-tools.ts, add manual tools
```

Gateway-level surfaces quote the gateway endpoint count (~153); MCP-server surfaces quote the served tool count (~148, gateway minus the agent-wallet endpoints). Don't assume these numbers are current — recount against the live manifest.

The only env vars the code reads are `SPRAAY_GATEWAY_URL`, `EVM_PRIVATE_KEY` (now optional), `MCP_TRANSPORT`, `MCP_PORT`/`PORT`.

## Known doc/code drift

The http info page (`startHttpServer` `GET /`) advertises **3 resources + 4 prompts**, but no `server.resource`/`server.prompt` are registered anywhere — only `server.tool`. (A prior `SPRAAY_ENABLE_PAYMENTS` master gate and `SPRAAY_MAX_SPEND_USDC`/`SPRAAY_DAILY_CAP_USDC` spend caps were reverted in commit `d9ea04c "Revert spend-guard experiment"` and are no longer referenced by the README either.)
