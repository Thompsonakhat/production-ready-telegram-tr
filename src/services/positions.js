import { col } from "../lib/db.js";
import { log, safeErr } from "../lib/log.js";

const memoryPositions = new Map();
const key = (userId, tokenAddress) => `${userId}:${tokenAddress.toLowerCase()}`;

export async function listPositions(userId) {
  const positions = await col("positions");
  if (!positions) return [...memoryPositions.values()].filter((p) => p.userId === String(userId) && p.status === "open");
  try {
    return await positions.find({ userId: String(userId), status: "open" }).sort({ updatedAt: -1 }).limit(20).toArray();
  } catch (err) {
    log.error("Positions read failed", { collection: "positions", operation: "find", userId: String(userId), error: safeErr(err) });
    return [];
  }
}

export async function upsertPositionFromTrade({ userId, tokenAddress, side, amount, estimatedValue }) {
  const now = new Date();
  const sizeDelta = side === "buy" ? Number(amount || 0) : -Number(amount || 0);
  const positions = await col("positions");
  if (!positions) {
    const id = key(String(userId), tokenAddress);
    const existing = memoryPositions.get(id) || { userId: String(userId), tokenAddress, size: 0, costBasis: 0, realizedPnl: 0, averageEntryPrice: 0, status: "open", createdAt: now };
    existing.size = Math.max(0, Number(existing.size || 0) + sizeDelta);
    existing.costBasis = Math.max(0, Number(existing.costBasis || 0) + (side === "buy" ? Number(estimatedValue || 0) : 0));
    existing.averageEntryPrice = existing.size > 0 ? existing.costBasis / existing.size : 0;
    existing.status = existing.size > 0 ? "open" : "closed";
    existing.updatedAt = now;
    memoryPositions.set(id, existing);
    return existing;
  }
  try {
    await positions.updateOne(
      { userId: String(userId), tokenAddress: tokenAddress.toLowerCase() },
      {
        $setOnInsert: { createdAt: now, realizedPnl: 0, costBasis: 0 },
        $inc: { size: sizeDelta, ...(side === "buy" ? { costBasis: Number(estimatedValue || 0) } : {}) },
        $set: { userId: String(userId), tokenAddress: tokenAddress.toLowerCase(), status: "open", updatedAt: now }
      },
      { upsert: true }
    );
    const pos = await positions.findOne({ userId: String(userId), tokenAddress: tokenAddress.toLowerCase() });
    const avg = Number(pos?.size || 0) > 0 ? Number(pos?.costBasis || 0) / Number(pos.size) : 0;
    await positions.updateOne({ _id: pos._id }, { $set: { averageEntryPrice: avg, updatedAt: new Date() } });
    return await positions.findOne({ _id: pos._id });
  } catch (err) {
    log.error("Position update failed", { collection: "positions", operation: "updateOne", userId: String(userId), error: safeErr(err) });
    throw err;
  }
}
