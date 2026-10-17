import { asObject, asString } from "../locate.js";
import type { Finding, Install, JsonObject } from "../types.js";

/** Official gateway.bind enum (OpenClaw Zod schema). */
const BIND_LOOPBACK = new Set(["loopback"]);
const BIND_PUBLIC = new Set(["lan", "auto", "tailnet", "custom"]);
/** Legacy host aliases still accepted by older installs; not valid enum values. */
const LEGACY_LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const LEGACY_PUBLIC = new Set(["0.0.0.0", "::", "[::]", "*"]);

export function checkGateway(install: Install): Finding[] {
  const findings: Finding[] = [];
  const gateway = asObject(install.config?.gateway) ?? {};
  const bind = asString(gateway.bind) ?? "loopback";
  const customHost = asString(gateway.customBindHost);
  const publicBind = isPublicBind(bind, customHost);

  if (publicBind) {
    findings.push({
      id: "gateway-public-bind",
      title: "Gateway bound to a public interface",
      severity: "critical",
      weight: 12,
      evidence: `gateway.bind is ${JSON.stringify(bind)}${customHost ? ` (customBindHost ${JSON.stringify(customHost)})` : ""} — official values are loopback | lan | auto | tailnet | custom; this listens beyond loopback.`,
      fix: 'Set gateway.bind to "loopback" (the documented local-only enum value).',
      file: install.configPath ?? undefined,
    });
  }

  findings.push(...checkAuth(gateway, install.configPath));
  findings.push(...checkOrigin(gateway, publicBind, install.configPath));
  return findings;
}

function isPublicBind(bind: string, customHost: string | null): boolean {
  const b = bind.trim().toLowerCase();
  if (BIND_LOOPBACK.has(b) || LEGACY_LOOPBACK.has(b)) return false;
  if (BIND_PUBLIC.has(b) || LEGACY_PUBLIC.has(b)) {
    if (b === "custom" && customHost && (BIND_LOOPBACK.has(customHost.trim().toLowerCase()) || LEGACY_LOOPBACK.has(customHost.trim().toLowerCase()))) {
      return false;
    }
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(b)) {
    return b !== "127.0.0.1";
  }
  return false;
}

function checkAuth(gateway: JsonObject, file?: string | null): Finding[] {
  const auth = asObject(gateway.auth) ?? {};
  const mode = (asString(auth.mode) ?? "token").toLowerCase();
  const token = asString(auth.token);
  const password = asString(auth.password);

  if (mode === "none") {
    return [
      {
        id: "gateway-auth-token",
        title: "Gateway authentication disabled",
        severity: "critical",
        weight: 10,
        evidence: 'gateway.auth.mode is "none" — any local (or remote, if bound publicly) client can operate the gateway.',
        fix: 'Set gateway.auth.mode to "token" and configure a long random token (or use openclaw doctor --generate-gateway-token).',
        file: file ?? undefined,
      },
    ];
  }

  if (mode === "trusted-proxy") return [];

  if (mode === "password") {
    if (!password || isWeakSecret(password)) {
      return [
        {
          id: "gateway-auth-token",
          title: "Missing or weak gateway password",
          severity: "high",
          weight: 10,
          evidence: password
            ? "gateway.auth.password is present but weak (short or a common placeholder). Value [REDACTED]."
            : "gateway.auth.mode is password but no password is set.",
          fix: "Set a long random gateway.auth.password or switch to token auth.",
          file: file ?? undefined,
        },
      ];
    }
    return [];
  }

  if (!token) {
    return [
      {
        id: "gateway-auth-token",
        title: "Missing gateway auth token",
        severity: "high",
        weight: 10,
        evidence: "gateway.auth.token is missing. OpenClaw may generate a runtime-only token, so clients and restarts do not share a stable secret.",
        fix: "Set gateway.auth.token to a long random value (20+ characters) or OPENCLAW_GATEWAY_TOKEN in the process environment — never commit the value.",
        file: file ?? undefined,
      },
    ];
  }

  if (isWeakSecret(token)) {
    return [
      {
        id: "gateway-auth-token",
        title: "Weak gateway auth token",
        severity: "high",
        weight: 8,
        evidence: `gateway.auth.token is weak (length ${token.length} or a common placeholder). Value [REDACTED].`,
        fix: "Replace the token with a long random secret (20+ characters). Rotate any token that may have been shared.",
        file: file ?? undefined,
      },
    ];
  }
  return [];
}

function isWeakSecret(value: string): boolean {
  const v = value.trim();
  if (v.length < 20) return true;
  if (/^(password|secret|token|changeme|admin|test|gateway-token|your-token|replace_me)$/i.test(v)) {
    return true;
  }
  if (/^([a-zA-Z0-9])\1+$/.test(v)) return true;
  return false;
}

function checkOrigin(gateway: JsonObject, publicBind: boolean, file?: string | null): Finding[] {
  const controlUi = asObject(gateway.controlUi) ?? {};
  const allowed = controlUi.allowedOrigins;
  const origins = Array.isArray(allowed) ? allowed.filter((x) => typeof x === "string") as string[] : [];
  const wildcard = origins.some((o) => o === "*" || o === "null");
  const hostFallback = controlUi.dangerouslyAllowHostHeaderOriginFallback === true;
  const publicOrigin = asString(gateway.publicOrigin);

  if (wildcard) {
    return [
      {
        id: "gateway-origin-check",
        title: "Origin checks allow any browser origin",
        severity: "high",
        weight: 5,
        evidence: 'gateway.controlUi.allowedOrigins includes "*" — any site can talk to the Control UI WebSocket.',
        fix: 'Replace "*" with the exact origins you use (scheme + host + port), for example http://127.0.0.1:18789.',
        file: file ?? undefined,
      },
    ];
  }
  if (hostFallback) {
    return [
      {
        id: "gateway-origin-check",
        title: "Dangerous Host-header origin fallback enabled",
        severity: "high",
        weight: 5,
        evidence: "gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback is true.",
        fix: "Set dangerouslyAllowHostHeaderOriginFallback to false and list explicit allowedOrigins.",
        file: file ?? undefined,
      },
    ];
  }
  if (publicBind && origins.length === 0 && !publicOrigin) {
    return [
      {
        id: "gateway-origin-check",
        title: "Origin checks not configured for a public gateway",
        severity: "medium",
        weight: 6,
        evidence: "Gateway is bound beyond loopback but gateway.controlUi.allowedOrigins and gateway.publicOrigin are unset.",
        fix: "Set gateway.controlUi.allowedOrigins to the exact browser origins that should load the Control UI.",
        file: file ?? undefined,
      },
    ];
  }
  return [];
}
