import { startSnipe } from "../features/tradingUi.js";

export default function register(bot) {
  bot.command("snipe", (ctx) => startSnipe(ctx, ctx.match));
}
