import { showBalance } from "../features/tradingUi.js";

export default function register(bot) {
  bot.command("balance", showBalance);
}
