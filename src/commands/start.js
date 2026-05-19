import { mainMenu, riskLine } from "../lib/ui.js";
import { ensureUser } from "../services/users.js";

export default function register(bot) {
  bot.command("start", async (ctx) => {
    await ensureUser(ctx);
    await ctx.reply(`Welcome. This bot helps preview and manage high-risk token trading and sniping.\n${riskLine}\nStart with Wallet, then fund it, set limits, and preview a trade.`, { reply_markup: mainMenu() });
  });
}
