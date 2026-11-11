# mcp-server

An [MCP](https://modelcontextprotocol.io) server your AI assistant can call, running on the phone all day. It comes with two tools, `save_note` and `list_notes`, so your assistant gets a memory that lives on your phone.

## Connect your assistant

Open the app’s URL: it shows the exact command. For Claude Code:

```bash
claude mcp add --transport http droidhost http://<phone>:<port>/mcp
```

For an assistant outside your Wi-Fi, run `npx droidhost expose` and use the public URL with `/mcp` on the end.

## Make it yours

Add a tool to the list in `tools.js`, then run:

```bash
npx droidhost deploy
```

You don’t need to touch `server.js`.

Anyone who can reach the URL can call the tools. Keep it on your Wi-Fi, or add a check in `server.js` before you make it public.
