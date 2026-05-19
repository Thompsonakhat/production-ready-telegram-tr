import { showPositions } from "../features/tradingUi.js";

export default function register(bot) {
  bot.command("positions", showPositions);
}
