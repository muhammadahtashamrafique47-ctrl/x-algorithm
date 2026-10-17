/**
 * Production launcher that binds BOTH IP stacks.
 *
 * The preview proxy dials `localhost:3000`, and on this image `localhost`
 * resolves to `::1` FIRST (see /etc/hosts / getent). `next start -H 0.0.0.0`
 * only creates an IPv4 listener, so that connection is refused and the proxy
 * reports **502 Bad Gateway** even though the app is up and answering on
 * 127.0.0.1.
 *
 * Binding the IPv6 wildcard `::` is dual-stack whenever
 * `net.ipv6.bindv6only=0` (the Linux default), so one listener answers `::1`,
 * `127.0.0.1` and the container's routable addresses alike. Where IPv6 is
 * unavailable or refused, this falls back to `0.0.0.0` so `npm start` keeps
 * working everywhere.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = require.resolve("next/dist/bin/next");
const port = process.env.PORT ?? "3000";

/** Can this machine bind an IPv6 wildcard socket at all? */
function canBindIPv6() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    const fail = () => resolve(false);
    probe.once("error", fail);
    probe.once("listening", () => probe.close(() => resolve(true)));
    try {
      probe.listen(0, "::");
    } catch {
      fail();
    }
  });
}

let active = null;

function launch(host, allowFallback) {
  const child = spawn(process.execPath, [nextBin, "start", "-H", host, "-p", port], {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, PORT: port, HOSTNAME: host },
  });
  active = child;

  // A bind failure (EAFNOSUPPORT / EADDRNOTAVAIL / no IPv6 in the container)
  // surfaces as a fast non-zero exit — retry once on the IPv4 wildcard.
  const startedAt = Date.now();
  child.on("exit", (code, signal) => {
    if (allowFallback && !signal && code !== 0 && Date.now() - startedAt < 15_000) {
      console.warn(`[serve] could not bind "${host}" (exit ${code}); falling back to 0.0.0.0`);
      launch("0.0.0.0", false);
      return;
    }
    process.exit(code ?? 0);
  });

  return child;
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (active && !active.killed) active.kill(signal);
    setTimeout(() => process.exit(0), 300).unref?.();
  });
}

const host = (await canBindIPv6()) ? "::" : "0.0.0.0";
console.log(
  `[serve] binding ${host === "::" ? "dual-stack (:: — IPv6 plus IPv4-mapped)" : "IPv4 (0.0.0.0)"} on port ${port}`,
);
launch(host, true);
