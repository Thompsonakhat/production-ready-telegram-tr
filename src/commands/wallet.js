import { showWallet } from "../features/tradingUi.js";

export default function register(bot) {
  bot.command("wallet", showWallet);
}
