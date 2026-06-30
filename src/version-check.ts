// Non-blocking "is there a newer version?" check against the npm registry.
//
// Fired once at startup and intentionally fire-and-forget: any failure (offline,
// timeout, registry hiccup) is swallowed so it can never delay or break the
// server. Output goes to stderr, which is safe for the stdio MCP transport
// (stdout is reserved for the protocol).

/** Compare two dotted numeric versions; true if `a` is strictly newer than `b`. */
function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export async function checkForUpdates(name: string, current: string): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
      signal: controller.signal,
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    clearTimeout(timer);
    if (!res.ok) return;

    const data = (await res.json()) as { version?: string };
    const latest = data?.version;
    if (latest && isNewer(latest, current)) {
      console.error(`\n📦 Update available for ${name}: ${current} → ${latest}`);
      console.error(`   Restart with the latest, e.g.  npx -y ${name}@latest\n`);
    }
  } catch {
    // Non-blocking by design — never let an update check interfere with startup.
  }
}
