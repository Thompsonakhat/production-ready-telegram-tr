import { startSell } from "../features/tradingUi.js";

export default function register(bot) {
  bot.command("sell", (ctx) => startSell(ctx, ctx.match));
}
