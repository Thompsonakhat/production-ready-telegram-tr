import crypto from "node:crypto";
import { cfg } from "./config.js";

function key() {
  if (!cfg.WALLET_ENCRYPTION_SECRET) throw new Error("WALLET_ENCRYPTION_SECRET missing");
  return crypto.createHash("sha256").update(cfg.WALLET_ENCRYPTION_SECRET).digest();
}

export function encryptSecret(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64")
  };
}
