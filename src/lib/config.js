export const cfg = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  MONGODB_URI: process.env.MONGODB_URI || "",
  WALLET_ENCRYPTION_SECRET: process.env.WALLET_ENCRYPTION_SECRET || "",
  RPC_URL: process.env.RPC_URL || "",
  CHAIN_ID: String(process.env.CHAIN_ID || "1"),
  NATIVE_SYMBOL: process.env.NATIVE_SYMBOL || "ETH",
  DEX_AGGREGATOR_BASE_URL: (process.env.DEX_AGGREGATOR_BASE_URL || "").replace(/\/+$/, ""),
  DEX_AGGREGATOR_API_KEY: process.env.DEX_AGGREGATOR_API_KEY || "",
  MARKET_DATA_API_URL: (process.env.MARKET_DATA_API_URL || "").replace(/\/+$/, ""),
  RISK_API_URL: (process.env.RISK_API_URL || "").replace(/\/+$/, ""),
  TRADING_ENABLED: String(process.env.TRADING_ENABLED || "false").toLowerCase() === "true",
  SNIPE_POLL_INTERVAL_MS: Number(process.env.SNIPE_POLL_INTERVAL_MS || 15000)
};

export function logEnvSanity() {
  console.log("[boot] config", {
    TELEGRAM_BOT_TOKEN_set: !!cfg.TELEGRAM_BOT_TOKEN,
    MONGODB_URI_set: !!cfg.MONGODB_URI,
    WALLET_ENCRYPTION_SECRET_set: !!cfg.WALLET_ENCRYPTION_SECRET,
    RPC_URL_set: !!cfg.RPC_URL,
    DEX_AGGREGATOR_BASE_URL_set: !!cfg.DEX_AGGREGATOR_BASE_URL,
    DEX_AGGREGATOR_API_KEY_set: !!cfg.DEX_AGGREGATOR_API_KEY,
    MARKET_DATA_API_URL_set: !!cfg.MARKET_DATA_API_URL,
    RISK_API_URL_set: !!cfg.RISK_API_URL,
    CHAIN_ID: cfg.CHAIN_ID,
    NATIVE_SYMBOL: cfg.NATIVE_SYMBOL,
    TRADING_ENABLED: cfg.TRADING_ENABLED
  });
}
