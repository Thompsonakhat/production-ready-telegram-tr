import { InlineKeyboard } from "grammy";

export function mainMenu() {
  return new InlineKeyboard()
    .text("Wallet", "menu:wallet").text("Buy", "menu:buy")
    .row().text("Sell", "menu:sell").text("Snipe", "menu:snipe")
    .row().text("Balance", "menu:balance").text("Positions", "menu:positions")
    .row().text("Settings", "menu:settings").text("Help", "menu:help");
}

export function walletMenu(hasWallet = false) {
  const kb = new InlineKeyboard()
    .text("Create wallet", "wallet:create")
    .text("Import wallet", "wallet:import");
  if (hasWallet) kb.row().text("View address", "wallet:view").text("Disconnect", "wallet:delete:ask");
  return kb.row().text("Main menu", "menu:main");
}

export function settingsMenu() {
  return new InlineKeyboard()
    .text("Amount", "settings:defaultAmount").text("Slippage", "settings:defaultSlippage")
    .row().text("Max buy", "settings:maxBuy").text("Max %", "settings:maxPercentPerTrade")
    .row().text("Priority fee", "settings:priorityFee").text("TP", "settings:takeProfit")
    .row().text("SL", "settings:stopLoss").text("Confirmations", "settings:confirmations")
    .row().text("Main menu", "menu:main");
}

export function percentMenu(tokenAddress) {
  return new InlineKeyboard()
    .text("25%", `sell:pct:25:${tokenAddress}`)
    .text("50%", `sell:pct:50:${tokenAddress}`)
    .row().text("75%", `sell:pct:75:${tokenAddress}`)
    .text("100%", `sell:pct:100:${tokenAddress}`)
    .row().text("Custom", `sell:custom:${tokenAddress}`);
}

export function confirmMenu(id) {
  return new InlineKeyboard().text("Confirm", `trade:confirm:${id}`).text("Cancel", `trade:cancel:${id}`);
}

export const riskLine = "Crypto trading and sniping are high risk. This is not financial advice.";
