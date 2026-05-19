import { cfg } from "../lib/config.js";
import { log, safeErr } from "../lib/log.js";

export function validateTokenAddress(input) {
  const token = String(input || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(token)) return null;
  return token;
}

async function readJson(response) {
  const text = await response.text();
  try { return { text, json: JSON.parse(text) }; } catch { return { text, json: null }; }
}

export async function rpcCall(method, params = []) {
  if (!cfg.RPC_URL) return { ok: false, unavailable: true, error: "RPC_URL missing" };
  log.info("Provider call start", { feature: "rpc", method });
  try {
    const response = await fetch(cfg.RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
    });
    const { json, text } = await readJson(response);
    if (!response.ok || json?.error) throw new Error(json?.error?.message || text || "RPC error");
    log.info("Provider call success", { feature: "rpc", method });
    return { ok: true, result: json.result };
  } catch (err) {
    log.error("Provider call failed", { feature: "rpc", method, error: safeErr(err) });
    return { ok: false, error: safeErr(err) };
  }
}

export async function getNativeBalance(address) {
  const res = await rpcCall("eth_getBalance", [address, "latest"]);
  if (!res.ok) return res;
  const wei = BigInt(res.result || "0x0");
  const value = Number(wei) / 1e18;
  return { ok: true, balance: value };
}

export async function fetchQuote({ side, tokenAddress, amount, slippage, userId }) {
  if (!cfg.DEX_AGGREGATOR_BASE_URL) {
    return { ok: false, unavailable: true, warnings: ["DEX quote service is not configured."] };
  }
  log.info("Trading gateway call start", { feature: "quote", side, tokenAddress, userId: String(userId) });
  try {
    const response = await fetch(`${cfg.DEX_AGGREGATOR_BASE_URL}/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.DEX_AGGREGATOR_API_KEY ? { Authorization: `Bearer ${cfg.DEX_AGGREGATOR_API_KEY}` } : {})
      },
      body: JSON.stringify({ chainId: cfg.CHAIN_ID, side, tokenAddress, amount, slippage })
    });
    const { json, text } = await readJson(response);
    if (!response.ok) throw new Error(json?.message || text || "Quote failed");
    log.info("Trading gateway call success", { feature: "quote", side, tokenAddress, userId: String(userId) });
    return { ok: true, data: json };
  } catch (err) {
    log.error("Trading gateway call failed", { feature: "quote", side, tokenAddress, userId: String(userId), error: safeErr(err) });
    return { ok: false, error: safeErr(err), warnings: ["Quote failed. Confirmation will be required if you continue."] };
  }
}

export async function fetchLiquidity(tokenAddress) {
  if (!cfg.MARKET_DATA_API_URL) return { ok: false, unavailable: true, warning: "External liquidity verification is unavailable." };
  log.info("Trading gateway call start", { feature: "liquidity", tokenAddress });
  try {
    const response = await fetch(`${cfg.MARKET_DATA_API_URL}/liquidity?chainId=${encodeURIComponent(cfg.CHAIN_ID)}&token=${encodeURIComponent(tokenAddress)}`);
    const { json, text } = await readJson(response);
    if (!response.ok) throw new Error(json?.message || text || "Liquidity check failed");
    log.info("Trading gateway call success", { feature: "liquidity", tokenAddress });
    return { ok: true, data: json };
  } catch (err) {
    log.error("Trading gateway call failed", { feature: "liquidity", tokenAddress, error: safeErr(err) });
    return { ok: false, warning: "Liquidity check failed." };
  }
}

export async function fetchRisk(tokenAddress) {
  if (!cfg.RISK_API_URL) return { ok: false, unavailable: true, warning: "Risk scoring is unavailable." };
  log.info("Trading gateway call start", { feature: "risk", tokenAddress });
  try {
    const response = await fetch(`${cfg.RISK_API_URL}/risk?chainId=${encodeURIComponent(cfg.CHAIN_ID)}&token=${encodeURIComponent(tokenAddress)}`);
    const { json, text } = await readJson(response);
    if (!response.ok) throw new Error(json?.message || text || "Risk check failed");
    log.info("Trading gateway call success", { feature: "risk", tokenAddress });
    return { ok: true, data: json };
  } catch (err) {
    log.error("Trading gateway call failed", { feature: "risk", tokenAddress, error: safeErr(err) });
    return { ok: false, warning: "Risk check failed." };
  }
}
