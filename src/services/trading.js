import crypto from "node:crypto";
import { cfg } from "../lib/config.js";
import { col } from "../lib/db.js";
import { log, safeErr } from "../lib/log.js";
import { getSettings } from "./users.js";
import { getWallet } from "./wallets.js";
import { fetchLiquidity, fetchQuote, fetchRisk, validateTokenAddress } from "./market.js";
import { upsertPositionFromTrade } from "./positions.js";

const memoryTrades = new Map();

export async function buildTradePreview({ userId, side, tokenAddress, amount, slippage }) {
  const token = validateTokenAddress(tokenAddress);
  if (!token) return { ok: false, message: "That token address looks invalid." };
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return { ok: false, message: "Enter a valid amount." };
  const wallet = await getWallet(userId);
  if (!wallet) return { ok: false, message: "Set up Wallet first.", needsWallet: true };
  const settings = await getSettings(userId);
  const usedSlippage = slippage === undefined || slippage === "" ? Number(settings.defaultSlippage) : Number(slippage);
  if (!Number.isFinite(usedSlippage) || usedSlippage < 0 || usedSlippage > 50) return { ok: false, message: "Slippage must be between 0 and 50%." };

  const warnings = [];
  const quote = await fetchQuote({ side, tokenAddress: token, amount: numericAmount, slippage: usedSlippage, userId });
  if (!quote.ok) warnings.push(...(quote.warnings || ["Quote unavailable."]));

  const liquidity = await fetchLiquidity(token);
  if (liquidity.warning) warnings.push(liquidity.warning);
  const liqValue = Number(liquidity.data?.liquidityUsd || liquidity.data?.usd || 0);
  if (liquidity.ok && liqValue > 0 && liqValue < numericAmount * 1000) warnings.push("Low liquidity warning.");

  const risk = await fetchRisk(token);
  if (risk.warning) warnings.push(risk.warning);
  const riskLevel = String(risk.data?.level || risk.data?.severity || "").toLowerCase();
  if (["high", "critical", "risky"].includes(riskLevel)) warnings.push("Risky-token warning from configured risk API.");

  if (side === "buy" && numericAmount > Number(settings.maxBuy || 0)) warnings.push("Trade exceeds your max buy setting.");
  const requiresExtraConfirm = warnings.length > 0 || !quote.ok || numericAmount > Number(settings.maxBuy || 0);
  return { ok: true, side, tokenAddress: token, amount: numericAmount, slippage: usedSlippage, wallet, settings, quote, liquidity, risk, warnings, requiresExtraConfirm };
}

export function formatPreview(preview) {
  const q = preview.quote?.data || {};
  const out = q.expectedOut || q.amountOut || q.toAmount || "quote unavailable";
  const fee = q.fee || q.estimatedFee || "estimated";
  const warn = preview.warnings.length ? `\nWarnings: ${preview.warnings.join(" ")}` : "";
  const mode = cfg.TRADING_ENABLED ? "Trading is enabled." : "Preview only. Trading is disabled.";
  return `${preview.side.toUpperCase()} preview\nToken: ${preview.tokenAddress}\nAmount: ${preview.amount} ${cfg.NATIVE_SYMBOL}\nExpected: ${out}\nSlippage: ${preview.slippage}%\nFees: ${fee}\n${mode}${warn}\nCrypto trading is high risk. Not financial advice.`;
}

export async function executeTrade(preview) {
  const now = new Date();
  const tradeId = crypto.randomUUID();
  const baseDoc = {
    tradeId,
    userId: String(preview.wallet.userId),
    side: preview.side,
    tokenAddress: preview.tokenAddress.toLowerCase(),
    amountIn: preview.amount,
    quoteData: preview.quote?.data || null,
    txHash: "",
    status: cfg.TRADING_ENABLED ? "created" : "preview_only",
    errorSummary: "",
    updatedAt: now
  };
  const trades = await col("trades");
  if (!trades) memoryTrades.set(tradeId, { ...baseDoc, createdAt: now });
  else {
    try {
      await trades.updateOne({ tradeId }, { $setOnInsert: { createdAt: now }, $set: baseDoc }, { upsert: true });
    } catch (err) {
      log.error("Trade write failed", { collection: "trades", operation: "updateOne", tradeId, error: safeErr(err) });
      throw err;
    }
  }

  if (!cfg.TRADING_ENABLED) return { ok: true, status: "preview_only", message: "Preview saved. Trading is disabled." };
  if (!cfg.DEX_AGGREGATOR_BASE_URL) return { ok: false, message: "Execution service is not configured." };

  log.info("Trading gateway call start", { feature: "execute", side: preview.side, tokenAddress: preview.tokenAddress, userId: String(preview.wallet.userId), tradeId });
  try {
    const response = await fetch(`${cfg.DEX_AGGREGATOR_BASE_URL}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.DEX_AGGREGATOR_API_KEY ? { Authorization: `Bearer ${cfg.DEX_AGGREGATOR_API_KEY}` } : {})
      },
      body: JSON.stringify({ chainId: cfg.CHAIN_ID, tradeId, side: preview.side, tokenAddress: preview.tokenAddress, amount: preview.amount, slippage: preview.slippage, walletAddress: preview.wallet.publicAddress })
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    if (!response.ok) throw new Error(json?.message || text || "Execution failed");
    const txHash = json?.txHash || json?.transactionHash || "submitted";
    const status = txHash === "submitted" ? "submitted" : "submitted";
    if (trades) await trades.updateOne({ tradeId }, { $set: { txHash, status, updatedAt: new Date() } });
    await upsertPositionFromTrade({ userId: preview.wallet.userId, tokenAddress: preview.tokenAddress, side: preview.side, amount: preview.amount, estimatedValue: preview.amount });
    log.info("Trading gateway call success", { feature: "execute", side: preview.side, tokenAddress: preview.tokenAddress, userId: String(preview.wallet.userId), tradeId });
    return { ok: true, status, txHash, message: `Submitted. Tx: ${txHash}` };
  } catch (err) {
    const errorSummary = safeErr(err);
    if (trades) await trades.updateOne({ tradeId }, { $set: { status: "failed", errorSummary, updatedAt: new Date() } });
    log.error("Trading gateway call failed", { feature: "execute", side: preview.side, tokenAddress: preview.tokenAddress, userId: String(preview.wallet.userId), tradeId, error: errorSummary });
    return { ok: false, message: "Transaction failed before submission. Check settings and try again." };
  }
}
