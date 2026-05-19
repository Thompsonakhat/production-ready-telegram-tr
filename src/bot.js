import { Bot } from "grammy";
import { registerCommands } from "./commands/loader.js";
import { registerTradingUi } from "./features/tradingUi.js";
import { log, safeErr } from "./lib/log.js";

export async function createBot(token) {
  const bot = new Bot(token);
  await registerCommands(bot);
  registerTradingUi(bot);
  bot.catch((err) => {
    log.error("Telegram handler failed", { error: safeErr(err.error || err) });
  });
  return bot;
}
