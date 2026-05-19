import { cfg } from "../lib/config.js";
import { col } from "../lib/db.js";
import { log, safeErr } from "../lib/log.js";
import { buildTradePreview, executeTrade } from "./trading.js";

const memorySnipes = new Map();
let polling = false;
let lastMemLog = 0;

export async function saveSnipe(userId, data) {
  const now = new Date();
  const snipeId = data.snipeId || `${userId}:${String(data.tokenAddress).toLowerCase()}`;
  const doc = {
    snipeId,
    userId: String(userId),
    tokenAddress: String(data.tokenAddress).toLowerCase(),
    amount: Number(data.amount),
    slippage: Number(data.slippage),
    maxBuy: Number(data.maxBuy),
    priorityFee: Number(data.priorityFee || 0),
    takeProfit: Number(data.takeProfit || 0),
    stopLoss: Number(data.stopLoss || 0),
    status: data.status || "active",
    lastCheckData: data.lastCheckData || null,
    updatedAt: now
  };
  const snipes = await col("snipes");
  if (!snipes) {
    memorySnipes.set(snipeId, { ...doc, createdAt: now });
    return memorySnipes.get(snipeId);
  }
  try {
    await snipes.updateOne({ snipeId }, { $setOnInsert: { createdAt: now }, $set: doc }, { upsert: true });
    return await snipes.findOne({ snipeId });
  } catch (err) {
    log.error("Snipe write failed", { collection: "snipes", operation: "updateOne", userId: String(userId), error: safeErr(err) });
    throw err;
  }
}

export async function listSnipes(userId, activeOnly = false) {
  const snipes = await col("snipes");
  if (!snipes) return [...memorySnipes.values()].filter((s) => s.userId === String(userId) && (!activeOnly || s.status === "active"));
  try {
    return await snipes.find({ userId: String(userId), ...(activeOnly ? { status: "active" } : {}) }).sort({ updatedAt: -1 }).limit(20).toArray();
  } catch (err) {
    log.error("Snipe read failed", { collection: "snipes", operation: "find", userId: String(userId), error: safeErr(err) });
    return [];
  }
}

async function getActiveSnipes() {
  const snipes = await col("snipes");
  if (!snipes) return [...memorySnipes.values()].filter((s) => s.status === "active");
  return snipes.find({ status: "active" }).limit(25).toArray();
}

async function markSnipe(snipeId, patch) {
  const snipes = await col("snipes");
  const now = new Date();
  if (!snipes) {
    const s = memorySnipes.get(snipeId);
    if (s) memorySnipes.set(snipeId, { ...s, ...patch, updatedAt: now });
    return;
  }
  await snipes.updateOne({ snipeId }, { $set: { ...patch, updatedAt: now } });
}

async function runCycle(bot) {
  const active = await getActiveSnipes();
  log.info("Snipe poll cycle", { count: active.length });
  for (const snipe of active) {
    try {
      const preview = await buildTradePreview({ userId: snipe.userId, side: "buy", tokenAddress: snipe.tokenAddress, amount: snipe.amount, slippage: snipe.slippage });
      await markSnipe(snipe.snipeId, { lastCheckData: { ok: preview.ok, warnings: preview.warnings || [], checkedAt: new Date() } });
      if (!preview.ok || preview.requiresExtraConfirm || !cfg.TRADING_ENABLED) continue;
      const result = await executeTrade(preview);
      await markSnipe(snipe.snipeId, { status: result.ok ? "executed" : "failed", lastCheckData: { result, checkedAt: new Date() } });
      await bot.api.sendMessage(snipe.userId, result.ok ? `Snipe executed. ${result.message}` : `Snipe failed. ${result.message}`);
    } catch (err) {
      log.error("Snipe poll item failed", { snipeId: snipe.snipeId, error: safeErr(err) });
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startSnipePolling(bot) {
  if (polling) return;
  polling = true;
  log.info("Snipe polling started", { intervalMs: cfg.SNIPE_POLL_INTERVAL_MS });
  void (async () => {
    while (polling) {
      try {
        await runCycle(bot);
      } catch (err) {
        log.error("Snipe poll cycle failed", { error: safeErr(err) });
      }
      const now = Date.now();
      if (now - lastMemLog > 60000) {
        const m = process.memoryUsage();
        log.info("Memory", { rssMB: Math.round(m.rss / 1e6), heapUsedMB: Math.round(m.heapUsed / 1e6) });
        lastMemLog = now;
      }
      await sleep(Math.max(5000, Number(cfg.SNIPE_POLL_INTERVAL_MS || 15000)));
    }
  })();
}

export function stopSnipePolling() {
  polling = false;
}
