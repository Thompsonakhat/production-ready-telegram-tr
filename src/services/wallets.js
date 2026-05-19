import { Wallet } from "ethers";
import { cfg } from "../lib/config.js";
import { encryptSecret } from "../lib/crypto.js";
import { col } from "../lib/db.js";
import { log, safeErr } from "../lib/log.js";

const memoryWallets = new Map();

export async function getWallet(userId) {
  const wallets = await col("wallets");
  if (!wallets) return memoryWallets.get(String(userId)) || null;
  try {
    return await wallets.findOne({ userId: String(userId), status: "active" });
  } catch (err) {
    log.error("Wallet read failed", { collection: "wallets", operation: "findOne", userId: String(userId), error: safeErr(err) });
    return null;
  }
}

async function saveWallet(userId, publicAddress, encryptedSecretPayload, walletType) {
  const now = new Date();
  const doc = { userId: String(userId), publicAddress, encryptedSecretPayload, walletType, status: "active", updatedAt: now };
  const wallets = await col("wallets");
  if (!wallets) {
    const inMem = { ...doc, createdAt: now };
    memoryWallets.set(String(userId), inMem);
    return inMem;
  }
  try {
    await wallets.updateMany({ userId: String(userId), status: "active" }, { $set: { status: "archived", updatedAt: now } });
    await wallets.updateOne(
      { userId: String(userId), publicAddress },
      { $setOnInsert: { }, $set: doc },
      { upsert: true }
    );
    return await getWallet(userId);
  } catch (err) {
    log.error("Wallet write failed", { collection: "wallets", operation: "updateOne", userId: String(userId), error: safeErr(err) });
    throw err;
  }
}

export async function createWallet(userId) {
  if (!cfg.WALLET_ENCRYPTION_SECRET) throw new Error("Wallet encryption is not configured yet.");
  const wallet = Wallet.createRandom();
  const encrypted = encryptSecret({ privateKey: wallet.privateKey, type: "generated" });
  return saveWallet(userId, wallet.address, encrypted, "generated");
}

export async function importWallet(userId, secret) {
  if (!cfg.WALLET_ENCRYPTION_SECRET) throw new Error("Wallet encryption is not configured yet.");
  const raw = String(secret || "").trim();
  if (!raw) throw new Error("Secret is empty.");
  let wallet;
  if (raw.split(/\s+/).length >= 12) wallet = Wallet.fromPhrase(raw);
  else wallet = new Wallet(raw);
  const encrypted = encryptSecret({ privateKey: wallet.privateKey, type: "imported" });
  return saveWallet(userId, wallet.address, encrypted, "imported");
}

export async function deleteWallet(userId) {
  const now = new Date();
  const wallets = await col("wallets");
  if (!wallets) {
    memoryWallets.delete(String(userId));
    return true;
  }
  try {
    await wallets.updateMany(
      { userId: String(userId), status: "active" },
      { $set: { status: "deleted", updatedAt: now }, $unset: { encryptedSecretPayload: "" } }
    );
    return true;
  } catch (err) {
    log.error("Wallet delete failed", { collection: "wallets", operation: "updateMany", userId: String(userId), error: safeErr(err) });
    throw err;
  }
}

export function shortAddress(address) {
  const s = String(address || "");
  return s ? `${s.slice(0, 6)}...${s.slice(-4)}` : "none";
}
