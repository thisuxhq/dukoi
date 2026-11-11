// A Telegram bot that replies to messages. It asks Telegram for new messages
// (long polling), so it needs no public URL and opens no port.
const token = process.env.TELEGRAM_BOT_TOKEN
const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => res.json())

// Make it yours: what the bot says back.
function reply(text, from) {
  if (text === '/start') return `Hi ${from.first_name}! I run on an old phone. Send me anything.`
  return `You said: ${text}`
}

async function main() {
  const me = await api('getMe', {})
  if (!me.ok) throw new Error(`Telegram didn't accept the token: ${me.description}`)
  console.log(`@${me.result.username} is listening. Send it /start on Telegram.`)

  let offset = 0
  for (;;) {
    const updates = await api('getUpdates', { offset, timeout: 50 }).catch((err) => {
      console.error(`Couldn't reach Telegram (${err.message}). Trying again.`)
      return { result: [] }
    })
    for (const update of updates.result ?? []) {
      offset = update.update_id + 1
      const message = update.message
      if (!message?.text) continue
      await api('sendMessage', {
        chat_id: message.chat.id,
        text: reply(message.text, message.from),
      })
    }
    if (!updates.ok) await new Promise((r) => setTimeout(r, 5000))
  }
}

if (token) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
} else {
  // Stay up without a token, so the app doesn't crash over and over.
  console.log('No TELEGRAM_BOT_TOKEN yet. Run: npx dukoi env set TELEGRAM_BOT_TOKEN=<token>')
  setInterval(() => {}, 1 << 30)
}
