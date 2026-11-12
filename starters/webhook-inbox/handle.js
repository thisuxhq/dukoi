// Make it yours: what to do with each webhook.
// Every request to /hook is saved and shown in the inbox first, then handed to handle().
//
// What you get:
//   method   'POST'
//   path     '/hook/stripe'
//   query    URLSearchParams, e.g. query.get('ping')
//   headers  { 'content-type': 'application/json', ... } (names are lower case)
//   body     the raw body as text. Use JSON.parse(body) for JSON.
//
// What you return is the reply: a string, an object (sent as JSON), or nothing for {"ok": true}.
// If it throws, the sender gets a 500 and the error goes to the app's logs.

export async function handle({ method, path, headers, body }) {
  console.log(`${method} ${path} from ${headers['user-agent'] ?? 'someone'}, ${body.length} bytes`)

  // For example, act on GitHub pushes:
  // if (headers['x-github-event'] === 'push') {
  //   const push = JSON.parse(body)
  //   console.log(`${push.pusher.name} pushed to ${push.repository.full_name}`)
  // }
}
