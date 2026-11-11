# telegram-bot

A Telegram bot that replies to messages, running on the phone all day. It asks Telegram for new messages, so it needs no public URL.

## The token

Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot` and copy the token it gives you. `dukoi init telegram-bot` asks for it and saves it on the phone, not in this folder. To change it:

```bash
dukoi env set TELEGRAM_BOT_TOKEN=123456:ABC...
```

## Make it yours

Edit `reply()` in `bot.js`, then run:

```bash
dukoi deploy
```

`dukoi.json` tells Dukoi the bot opens no port, so it doesn't wait for one.
