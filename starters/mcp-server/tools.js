// The tools your AI assistant can call. Make it yours: add a tool to this list.
// Each one has a name, a description the assistant reads, the input it takes
// (JSON Schema) and run(), which returns the text the assistant sees.
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// DroidHost sets DATA_DIR to a folder that survives deploys and rollbacks.
const db = new DatabaseSync(join(process.env.DATA_DIR ?? '.', 'notes.db'))
db.exec(`CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`)

export const tools = [
  {
    name: 'save_note',
    description: 'Save a note to remember later.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'What to remember' } },
      required: ['text'],
    },
    run: ({ text }) => {
      db.prepare('INSERT INTO notes (text) VALUES (?)').run(String(text))
      return 'Saved.'
    },
  },
  {
    name: 'list_notes',
    description: 'List every saved note, newest first.',
    inputSchema: { type: 'object', properties: {} },
    run: () => {
      const notes = db.prepare('SELECT text, created_at FROM notes ORDER BY id DESC').all()
      return notes.length
        ? notes.map((n) => `- ${n.text} (${n.created_at})`).join('\n')
        : 'No notes yet.'
    },
  },
]
