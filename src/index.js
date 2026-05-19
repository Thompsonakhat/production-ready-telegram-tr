import "dotenv/config";

function localSafeErr(err) {
  return err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || String(err);
}

process.on("unhandledRejection", (err) => {
  console.error("[process] unhandledRejection", { error: localSafeErr(err) });
});

process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException", { error: localSafeErr(err) });
  process.exit(1);
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startPolling(bot, log, safeErr) {
  const { run } = await import("@grammyjs/runner");
  let backoff = 2000;
  let handle = null;
  while (true) {
    try {
      log.info("Telegram polling clear webhook", { dropPendingUpdates: true });
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      log.info("Telegram polling started", { concurrency: 1 });
      handle = run(bot);
      await handle.task();
      log.warn("Telegram polling stopped", {});
      backoff = 2000;
    } catch (err) {
      const message = safeErr(err);
      log.error("Telegram polling failed", { error: message, retryMs: backoff });
      if (handle) {
        try { await handle.stop(); } catch {}
        handle = null;
      }
      await sleep(backoff);
      backoff = Math.min(20000, backoff === 2000 ? 5000 : backoff * 2);
    }
  }
}

async function boot() {
  try {
    console.log("[boot] start");
    const { cfg, logEnvSanity } = await import("./lib/config.js");
    const { log, safeErr } = await import("./lib/log.js");
    const { connectDb, closeDb } = await import("./lib/db.js");
    const { createBot } = await import("./bot.js");
    const { startSnipePolling, stopSnipePolling } = await import("./services/snipes.js");

    logEnvSanity();
    if (!cfg.TELEGRAM_BOT_TOKEN) {
      console.error("TELEGRAM_BOT_TOKEN is required. Add it in the Config tab and redeploy.");
      process.exit(1);
    }

    await connectDb();
    const bot = await createBot(cfg.TELEGRAM_BOT_TOKEN);
    await bot.init();
    await bot.api.setMyCommands([
      { command: "start", description: "Open the trading menu" },
      { command: "help", description: "How to use the bot" },
      { command: "wallet", description: "Create, import, view, or disconnect wallet" },
      { command: "buy", description: "Preview and confirm a buy" },
      { command: "sell", description: "Preview and confirm a sell" },
      { command: "snipe", description: "Create a snipe target" },
      { command: "balance", description: "Show wallet balances" },
      { command: "positions", description: "Show open positions" },
      { command: "settings", description: "Edit trading defaults" }
    ]);

    startSnipePolling(bot);
    process.once("SIGTERM", async () => { stopSnipePolling(); await closeDb(); process.exit(0); });
    process.once("SIGINT", async () => { stopSnipePolling(); await closeDb(); process.exit(0); });
    await startPolling(bot, log, safeErr);
  } catch (err) {
    console.error("Boot error", { code: err?.code, error: localSafeErr(err) });
    if (err?.code === "ERR_MODULE_NOT_FOUND") console.error("Check package dependencies and relative .js imports.");
    process.exit(1);
  }
}

boot();
