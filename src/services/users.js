import { col, cleanMutable } from "../lib/db.js";
import { log, safeErr } from "../lib/log.js";

const memoryUsers = new Map();

export const defaultSettings = {
  defaultAmount: 0.01,
  defaultSlippage: 1,
  maxBuy: 0.05,
  maxPercentPerTrade: 10,
  priorityFee: 0,
  takeProfit: 0,
  stopLoss: 0,
  confirmations: true
};

function userIdFromCtx(ctx) {
  return String(ctx.from?.id || ctx.chat?.id || "unknown");
}

export async function ensureUser(ctx) {
  const userId = userIdFromCtx(ctx);
  const now = new Date();
  const mutable = cleanMutable({
    telegramUserId: userId,
    username: ctx.from?.username || "",
    firstName: ctx.from?.first_name || "",
    lastName: ctx.from?.last_name || "",
    updatedAt: now
  });
  const users = await col("users");
  if (!users) {
    const existing = memoryUsers.get(userId) || { telegramUserId: userId, settings: { ...defaultSettings }, createdAt: now };
    const next = { ...existing, ...mutable, settings: existing.settings || { ...defaultSettings } };
    memoryUsers.set(userId, next);
    return next;
  }
  try {
    await users.updateOne(
      { telegramUserId: userId },
      { $setOnInsert: { createdAt: now, settings: { ...defaultSettings } }, $set: mutable },
      { upsert: true }
    );
    return await users.findOne({ telegramUserId: userId });
  } catch (err) {
    log.error("User upsert failed", { collection: "users", operation: "updateOne", userId, error: safeErr(err) });
    return { telegramUserId: userId, settings: { ...defaultSettings } };
  }
}

export async function getSettings(userId) {
  const users = await col("users");
  if (!users) return memoryUsers.get(String(userId))?.settings || { ...defaultSettings };
  try {
    const user = await users.findOne({ telegramUserId: String(userId) });
    return { ...defaultSettings, ...(user?.settings || {}) };
  } catch (err) {
    log.error("Settings read failed", { collection: "users", operation: "findOne", userId: String(userId), error: safeErr(err) });
    return { ...defaultSettings };
  }
}

export async function updateSetting(userId, key, value) {
  const allowed = Object.keys(defaultSettings);
  if (!allowed.includes(key)) throw new Error("Unsupported setting");
  const now = new Date();
  const users = await col("users");
  if (!users) {
    const user = memoryUsers.get(String(userId)) || { telegramUserId: String(userId), settings: { ...defaultSettings }, createdAt: now };
    user.settings = { ...defaultSettings, ...user.settings, [key]: value };
    user.updatedAt = now;
    memoryUsers.set(String(userId), user);
    return user.settings;
  }
  try {
    await users.updateOne(
      { telegramUserId: String(userId) },
      { $setOnInsert: { createdAt: now }, $set: { [`settings.${key}`]: value, updatedAt: now } },
      { upsert: true }
    );
    return getSettings(userId);
  } catch (err) {
    log.error("Settings update failed", { collection: "users", operation: "updateOne", userId: String(userId), error: safeErr(err) });
    throw err;
  }
}
