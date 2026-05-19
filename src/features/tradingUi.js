import { InlineKeyboard } from "grammy";
import { cfg } from "../lib/config.js";
import { confirmMenu, mainMenu, percentMenu, riskLine, settingsMenu, walletMenu } from "../lib/ui.js";
import { publicUser, safeErr } from "../lib/log.js";
import { ensureUser, getSettings, updateSetting } from "../services/users.js";
import { createWallet, deleteWallet, getWallet, importWallet, shortAddress } from "../services/wallets.js";
import { getNativeBalance, validateTokenAddress } from "../services/market.js";
import { buildTradePreview, executeTrade, formatPreview } from "../services/trading.js";
import { listPositions } from "../services/positions.js";
import { listSnipes, saveSnipe } from "../services/snipes.js";

const flows = new Map();
const pendingTrades = new Map();
const pendingSnipes = new Map();

function setFlow(userId, flow) {
  if (flows.size > 5000) flows.clear();
  flows.set(String(userId), { ...flow, createdAt: Date.now() });
}

function tradeId() {
  return Math.random().toString(36).slice(2, 10);
}

export async function showWallet(ctx) {
  await ensureUser(ctx);
  const userId = String(ctx.from.id);
  const wallet = await getWallet(userId);
  const text = wallet ? `Wallet connected: ${shortAddress(wallet.publicAddress)}\n${riskLine}` : `No wallet yet. Create or import one to trade.\n${riskLine}`;
  return ctx.reply(text, { reply_markup: walletMenu(!!wallet) });
}

export async function showBalance(ctx) {
  const userId = String(ctx.from.id);
  const wallet = await getWallet(userId);
  if (!wallet) return ctx.reply("Set up Wallet first.", { reply_markup: walletMenu(false) });
  if (!cfg.RPC_URL) return ctx.reply("Balance service is unavailable. RPC_URL is not configured.");
  const native = await getNativeBalance(wallet.publicAddress);
  if (!native.ok) return ctx.reply("Could not refresh balance right now.");
  const positions = await listPositions(userId);
  const tracked = positions.length ? positions.map((p) => `${p.tokenAddress}: ${Number(p.size || 0).toFixed(6)}`).join("\n") : "No tracked token balances yet.";
  return ctx.reply(`Wallet: ${shortAddress(wallet.publicAddress)}\n${cfg.NATIVE_SYMBOL}: ${native.balance.toFixed(6)}\nTracked:\n${tracked}`);
}

export async function showPositions(ctx) {
  const userId = String(ctx.from.id);
  const positions = await listPositions(userId);
  if (!positions.length) return ctx.reply("No open positions yet.", { reply_markup: mainMenu() });
  for (const p of positions.slice(0, 8)) {
    const size = Number(p.size || 0).toFixed(6);
    const avg = Number(p.averageEntryPrice || 0).toFixed(6);
    await ctx.reply(`Position\nToken: ${p.tokenAddress}\nSize: ${size}\nAvg entry: ${avg}\nPnL: estimate unavailable`, { reply_markup: new InlineKeyboard().text("Sell", `pos:sell:${p.tokenAddress}`).text("Refresh", "menu:positions").row().text("Details", `pos:details:${p.tokenAddress}`) });
  }
}

export async function showSettings(ctx) {
  const settings = await getSettings(ctx.from.id);
  return ctx.reply(`Settings\nAmount: ${settings.defaultAmount}\nSlippage: ${settings.defaultSlippage}%\nMax buy: ${settings.maxBuy}\nMax % per trade: ${settings.maxPercentPerTrade}%\nPriority fee: ${settings.priorityFee}\nTP: ${settings.takeProfit}%\nSL: ${settings.stopLoss}%`, { reply_markup: settingsMenu() });
}

export async function showHelp(ctx) {
  return ctx.reply("Commands: /wallet, /buy, /sell, /snipe, /balance, /positions, /settings.\nFlow: create/import wallet, fund it, set limits, then preview trades.\nSafety checks warn on low liquidity, risky tokens, big buys, and missing quotes.\nEvery trade needs confirmation. Not financial advice.", { reply_markup: mainMenu() });
}

async function previewTrade(ctx, side, tokenAddress, amount, slippage) {
  const preview = await buildTradePreview({ userId: String(ctx.from.id), side, tokenAddress, amount, slippage });
  if (!preview.ok) return ctx.reply(preview.message, { reply_markup: preview.needsWallet ? walletMenu(false) : mainMenu() });
  const id = tradeId();
  pendingTrades.set(id, { userId: String(ctx.from.id), preview, expiresAt: Date.now() + 10 * 60 * 1000 });
  return ctx.reply(formatPreview(preview), { reply_markup: confirmMenu(id) });
}

export async function startBuy(ctx, args = "") {
  const [token, amount, slippage] = String(args || "").trim().split(/\s+/);
  if (token && amount) return previewTrade(ctx, "buy", token, amount, slippage);
  setFlow(ctx.from.id, { type: "buy_token" });
  return ctx.reply("Send the token address to buy.");
}

export async function startSell(ctx, args = "") {
  const [token, amountOrPercent, slippage] = String(args || "").trim().split(/\s+/);
  if (token && amountOrPercent) return previewTrade(ctx, "sell", token, String(amountOrPercent).replace("%", ""), slippage);
  const positions = await listPositions(ctx.from.id);
  if (!positions.length) return ctx.reply("No open positions to sell.");
  const kb = new InlineKeyboard();
  positions.slice(0, 8).forEach((p) => kb.text(shortAddress(p.tokenAddress), `pos:sell:${p.tokenAddress}`).row());
  return ctx.reply("Choose a position to sell.", { reply_markup: kb });
}

export async function startSnipe(ctx, args = "") {
  const token = validateTokenAddress(String(args || "").trim().split(/\s+/)[0]);
  const settings = await getSettings(ctx.from.id);
  if (!token) {
    setFlow(ctx.from.id, { type: "snipe_token" });
    return ctx.reply("Send the token address to snipe.");
  }
  const draft = { tokenAddress: token, amount: settings.defaultAmount, slippage: settings.defaultSlippage, maxBuy: settings.maxBuy, priorityFee: settings.priorityFee, takeProfit: settings.takeProfit, stopLoss: settings.stopLoss, status: "active" };
  const id = tradeId();
  pendingSnipes.set(id, { userId: String(ctx.from.id), draft });
  return ctx.reply(`Snipe summary\nToken: ${token}\nAmount: ${draft.amount}\nSlippage: ${draft.slippage}%\nMax buy: ${draft.maxBuy}\nPriority fee: ${draft.priorityFee}\nTP: ${draft.takeProfit}%\nSL: ${draft.stopLoss}%`, { reply_markup: new InlineKeyboard().text("Save enabled", `snipe:save:${id}`).text("Cancel", "menu:main") });
}

function validSettingValue(key, raw) {
  if (key === "confirmations") return ["on", "true", "yes", "1"].includes(String(raw).toLowerCase());
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error("Enter a positive number.");
  if (["defaultSlippage", "takeProfit", "stopLoss", "maxPercentPerTrade"].includes(key) && n > 100) throw new Error("Percent values must be 0 to 100.");
  if (key === "defaultSlippage" && n > 50) throw new Error("Slippage over 50% is blocked.");
  return n;
}

export function registerTradingUi(bot) {
  bot.callbackQuery(/.*/, async (ctx) => {
    const data = ctx.callbackQuery.data || "";
    await ctx.answerCallbackQuery().catch(() => {});
    if (data === "menu:main") return ctx.reply("Main menu", { reply_markup: mainMenu() });
    if (data === "menu:wallet") return showWallet(ctx);
    if (data === "menu:buy") return startBuy(ctx);
    if (data === "menu:sell") return startSell(ctx);
    if (data === "menu:snipe") return startSnipe(ctx);
    if (data === "menu:balance") return showBalance(ctx);
    if (data === "menu:positions") return showPositions(ctx);
    if (data === "menu:settings") return showSettings(ctx);
    if (data === "menu:help") return showHelp(ctx);
    if (data === "wallet:create") {
      try {
        const wallet = await createWallet(ctx.from.id);
        return ctx.reply(`Wallet created: ${wallet.publicAddress}\nFund it before trading. Secret is encrypted and never shown here.`);
      } catch (err) { return ctx.reply(`Wallet setup unavailable: ${safeErr(err)}`); }
    }
    if (data === "wallet:import") {
      if (!cfg.WALLET_ENCRYPTION_SECRET) return ctx.reply("Wallet import is disabled until WALLET_ENCRYPTION_SECRET is configured.");
      setFlow(ctx.from.id, { type: "wallet_import" });
      return ctx.reply("Send the private key or seed phrase now. I will not echo it and will try to delete the message.");
    }
    if (data === "wallet:view") {
      const wallet = await getWallet(ctx.from.id);
      return ctx.reply(wallet ? `Wallet: ${wallet.publicAddress}` : "No wallet connected.");
    }
    if (data === "wallet:delete:ask") return ctx.reply("Delete stored wallet data? This cannot be undone.", { reply_markup: new InlineKeyboard().text("Delete", "wallet:delete:yes").text("Cancel", "menu:wallet") });
    if (data === "wallet:delete:yes") { await deleteWallet(ctx.from.id); return ctx.reply("Wallet disconnected and stored secret removed."); }
    if (data.startsWith("settings:")) {
      const key = data.split(":")[1];
      setFlow(ctx.from.id, { type: "setting", key });
      return ctx.reply(`Send new value for ${key}.`);
    }
    if (data.startsWith("trade:confirm:")) {
      const id = data.split(":")[2];
      const pending = pendingTrades.get(id);
      if (!pending || pending.userId !== String(ctx.from.id) || pending.expiresAt < Date.now()) return ctx.reply("That confirmation expired.");
      pendingTrades.delete(id);
      const result = await executeTrade(pending.preview);
      return ctx.reply(result.message);
    }
    if (data.startsWith("trade:cancel:")) { pendingTrades.delete(data.split(":")[2]); return ctx.reply("Cancelled."); }
    if (data.startsWith("pos:sell:")) return ctx.reply("Choose sell size.", { reply_markup: percentMenu(data.slice("pos:sell:".length)) });
    if (data.startsWith("sell:pct:")) {
      const [, , pct, token] = data.split(":");
      return previewTrade(ctx, "sell", token, pct, undefined);
    }
    if (data.startsWith("sell:custom:")) { setFlow(ctx.from.id, { type: "sell_custom", tokenAddress: data.slice("sell:custom:".length) }); return ctx.reply("Send custom sell amount or percent."); }
    if (data.startsWith("snipe:save:")) {
      const id = data.split(":")[2];
      const pending = pendingSnipes.get(id);
      if (!pending || pending.userId !== String(ctx.from.id)) return ctx.reply("Snipe draft expired.");
      await saveSnipe(ctx.from.id, pending.draft);
      pendingSnipes.delete(id);
      return ctx.reply("Snipe saved and enabled. I will only execute when checks pass.");
    }
  });

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text || "";
    if (text.startsWith("/")) return next();
    const userId = String(ctx.from.id);
    const flow = flows.get(userId);
    if (!flow) return next();
    flows.delete(userId);
    try {
      if (flow.type === "wallet_import") {
        const wallet = await importWallet(userId, text);
        await ctx.deleteMessage().catch(() => {});
        return ctx.reply(`Wallet imported: ${wallet.publicAddress}`);
      }
      if (flow.type === "buy_token") { setFlow(userId, { type: "buy_amount", tokenAddress: text.trim() }); return ctx.reply("Send buy amount."); }
      if (flow.type === "buy_amount") return previewTrade(ctx, "buy", flow.tokenAddress, text.trim(), undefined);
      if (flow.type === "sell_custom") return previewTrade(ctx, "sell", flow.tokenAddress, text.trim().replace("%", ""), undefined);
      if (flow.type === "snipe_token") return startSnipe(ctx, text.trim());
      if (flow.type === "setting") {
        const value = validSettingValue(flow.key, text.trim());
        await updateSetting(userId, flow.key, value);
        return ctx.reply("Saved.", { reply_markup: settingsMenu() });
      }
    } catch (err) {
      return ctx.reply(`Could not save that. ${safeErr(err)}`);
    }
  });
}
