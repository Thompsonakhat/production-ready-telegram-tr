import { MongoClient } from "mongodb";
import { cfg } from "./config.js";
import { log, safeErr } from "./log.js";

let client = null;
let db = null;

export async function connectDb() {
  if (!cfg.MONGODB_URI) {
    log.warn("MongoDB disabled", { collection: "all", operation: "connect", reason: "MONGODB_URI missing" });
    return null;
  }
  if (db) return db;
  try {
    client = new MongoClient(cfg.MONGODB_URI, { maxPoolSize: 8, ignoreUndefined: true });
    await client.connect();
    db = client.db();
    await ensureIndexes();
    log.info("MongoDB connected", { collection: "all", operation: "connect" });
    return db;
  } catch (err) {
    log.error("MongoDB connection failed", { collection: "all", operation: "connect", error: safeErr(err) });
    return null;
  }
}

export function getDb() {
  return db;
}

export async function col(name) {
  const active = db || await connectDb();
  return active ? active.collection(name) : null;
}

export async function ensureIndexes() {
  if (!db) return;
  const indexes = [
    ["users", { telegramUserId: 1 }, { unique: true }],
    ["wallets", { userId: 1, status: 1 }, {}],
    ["snipes", { status: 1, updatedAt: -1 }, {}],
    ["trades", { userId: 1, createdAt: -1 }, {}],
    ["positions", { userId: 1, status: 1 }, {}]
  ];
  for (const [name, key, options] of indexes) {
    try {
      await db.collection(name).createIndex(key, options);
    } catch (err) {
      log.error("MongoDB index failed", { collection: name, operation: "createIndex", error: safeErr(err) });
    }
  }
}

export async function closeDb() {
  if (client) await client.close();
  client = null;
  db = null;
}

export function cleanMutable(obj = {}) {
  const out = { ...obj };
  delete out._id;
  delete out.createdAt;
  return out;
}
