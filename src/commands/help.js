import { showHelp } from "../features/tradingUi.js";

export default function register(bot) {
  bot.command("help", showHelp);
}
