# Trading Sniper Bot

This is a Telegram-only trading and sniping bot built with Node.js ES modules and grammY.

It helps users create or import an encrypted wallet, preview buys and sells, configure snipe targets, track positions, and edit trading safety settings.

Crypto trading and sniping are high risk. This bot is not financial advice.

## Commands

/start
Opens the main menu and shows the risk disclaimer.

/help
Shows commands, wallet requirements, safety checks, and the recommended flow.

/wallet
Create a new wallet, import a wallet, view the active public address, or delete stored wallet data.

/buy <tokenAddress> <amount> [slippage]
Starts a buy preview. The bot fetches a quote when a DEX aggregator is configured, checks risk and liquidity when configured, then requires confirmation.

/sell <tokenAddress> <amountOrPercent> [slippage]
Starts a sell preview. You can also select a position and use 25%, 50%, 75%, or 100% buttons.

/snipe [tokenAddress]
Creates a guided snipe target using your defaults for amount, slippage, max buy, priority fee, take-profit, and stop-loss.

/balance
Shows native balance and tracked token positions. Requires a wallet and RPC_URL.

/positions
Shows open positions with size, average entry, and basic estimated PnL status.

/settings
Opens inline buttons to edit default amount, slippage, max buy, max percent per trade, priority fee, take-profit, stop-loss, and confirmation preferences.

## Environment variables

TELEGRAM_BOT_TOKEN is required for Telegram.

MONGODB_URI enables persistent storage for users, wallets, snipes, trades, and positions. If missing, the bot starts with limited in-memory fallback.

WALLET_ENCRYPTION_SECRET is required for wallet creation and import. Wallet secrets are encrypted at rest. Private keys and seed phrases are never logged or echoed.

RPC_URL is used for native balance checks.

CHAIN_ID defaults to 1.

NATIVE_SYMBOL defaults to ETH.

DEX_AGGREGATOR_BASE_URL enables quote and execution provider calls.

DEX_AGGREGATOR_API_KEY is optional and sent only to the configured aggregator.

MARKET_DATA_API_URL enables liquidity checks.

RISK_API_URL enables risky-token scoring.

TRADING_ENABLED defaults to false. When false, the bot runs quote and preview flows only.

SNIPE_POLL_INTERVAL_MS defaults to 15000.

## Safety behavior

The bot validates token addresses before trading.

It warns when quotes are unavailable, liquidity checks are unavailable, risk scoring is unavailable, liquidity appears low, the risk API reports danger, or the trade exceeds max buy settings.

All transactions require explicit confirmation. Preview mode is used when TRADING_ENABLED=false.

## MongoDB collections

users stores Telegram metadata and trading settings.

wallets stores public wallet data and encrypted secret payloads.

snipes stores active and historical snipe targets.

trades stores quote, status, transaction hash, and failure summaries.

positions stores tracked token positions and average entry data.

createdAt is insert-only. Updates use updatedAt.

## Deployment

Install dependencies with npm run build.

Start with npm start.

On Render, set TELEGRAM_BOT_TOKEN and MONGODB_URI. Add WALLET_ENCRYPTION_SECRET before enabling wallet creation or import. Keep TRADING_ENABLED=false until provider integrations are tested.

The bot runs as one Node.js process. The snipe poller runs inside the same process.
