import { startBuy } from "../features/tradingUi.js";

export default function register(bot) {
  bot.command("buy", (ctx) => startBuy(ctx, ctx.match));
}
