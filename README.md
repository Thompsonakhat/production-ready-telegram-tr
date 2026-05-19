# Trading Sniper Bot

Telegram-only trading/sniping bot using Node.js ES modules, grammY, MongoDB, encrypted wallet storage, inline menus, preview-first trading, and a single-process snipe polling loop.

## Features

1) Wallet creation, import, view, and delete.
2) Encrypted wallet secrets using WALLET_ENCRYPTION_SECRET.
3) Buy and sell preview flows with confirmation.
4) Snipe target storage and polling.
5) Balance and position views.
6) Editable trading settings.
7) Liquidity and risk warnings when APIs are configured.
8) Preview-only mode unless TRADING_ENABLED=true.

## Setup

1) Install dependencies.

npm run build

2) Copy .env.sample to .env and fill values.

3) Start locally.

npm run dev

4) Start production.

npm start

## Required env

TELEGRAM_BOT_TOKEN is required.

MONGODB_URI is strongly recommended for persistence.

WALLET_ENCRYPTION_SECRET is required before wallet creation or import works.

## Optional env

RPC_URL enables /balance.

DEX_AGGREGATOR_BASE_URL enables /buy and /sell quotes and execution provider calls.

DEX_AGGREGATOR_API_KEY is optional provider auth.

MARKET_DATA_API_URL enables liquidity checks.

RISK_API_URL enables token risk scoring.

TRADING_ENABLED defaults to false.

## Commands

/start opens the main menu.

/help shows usage and safety notes.

/wallet opens wallet setup.

/buy <tokenAddress> <amount> [slippage] previews a buy.

/sell <tokenAddress> <amountOrPercent> [slippage] previews a sell.

/snipe [tokenAddress] creates a snipe target.

/balance shows native balance and tracked positions.

/positions lists open positions.

/settings edits defaults and safety limits.

## Architecture

src/index.js boots the app, validates Telegram config, connects MongoDB, starts the bot, and starts the in-process snipe poller.

src/bot.js creates the grammY bot and registers command modules before catch-all flow handlers.

src/commands contains public command modules.

src/features/tradingUi.js owns inline menus, callbacks, and multi-step flows.

src/services contains wallet, user, market, trading, position, and snipe logic.

src/lib contains config, logging, database, crypto, and UI helpers.

## Database

Collections: users, wallets, snipes, trades, positions.

Indexes are created only for application fields, never _id.

Upserts keep createdAt in $setOnInsert and updatedAt in $set.

## Deployment notes

Use one Node.js service. Do not run a separate worker.

The bot clears Telegram webhooks before long polling.

The snipe poller logs start, cycles, failures, and memory usage.

Keep TRADING_ENABLED=false until your RPC, aggregator, risk API, and market data integrations are tested.

## Troubleshooting

If the bot exits on boot, check TELEGRAM_BOT_TOKEN.

If wallet create/import is disabled, set WALLET_ENCRYPTION_SECRET.

If /balance says unavailable, set RPC_URL.

If quotes are unavailable, set DEX_AGGREGATOR_BASE_URL.

If safety checks say unavailable, configure MARKET_DATA_API_URL and RISK_API_URL.
