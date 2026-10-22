// Vercel serverless function. Holds the Anthropic API key so it never reaches the browser.
// Set ANTHROPIC_API_KEY in Vercel > Project > Settings > Environment Variables (locally: .env.local).
// Optional: CLAUDE_MODEL (defaults to a small, cheap model).
// The browser sends a task name and the data; the prompt is built here, so this endpoint
// can't be used as a general-purpose proxy for the key.
const MAX_PAYLOAD_CHARS = 8000;
const LANGS = { English: 'English', Hindi: 'Hindi (Devanagari script)', Kannada: 'Kannada (Kannada script)' };

const RULES = 'You write for a small restaurant owner in India. Use plain, short sentences. ' +
  'Use ONLY the numbers in the data. Do not add, remove, round differently or calculate any number. Write every number with the digits 0-9 exactly as given, including ₹ and %. Keep times like "7 pm" as written. ' +
  'Never say a platform overcharged, made a mistake or did anything wrong. Do not guess causes. Anything marked as an estimate stays an estimate.';

const TASKS = {
  phrase: lang => ({
    system: RULES,
    user: 'Re-word each field below in ' + lang + ' so an owner understands it at a glance. Keep the meaning and every number. ' +
      'Reply with JSON only, with exactly the same keys, and nothing else.\n\nDATA:\n'
  }),
  draft: () => ({
    system: RULES,
    user: 'Write a short, polite message from a restaurant partner to Swiggy partner support asking them to explain the item below. ' +
      'Ask them to confirm the basis and reply in writing. Include the order IDs if any. Keep [Restaurant name], [Restaurant ID], [Your name] and [Phone] exactly as written. ' +
      'Plain text in English with a subject line, under 150 words.\n\nDATA:\n'
  })
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI not configured' }); // the page falls back to templates
  const body = req.body || {};
  const task = TASKS[body.task];
  const lang = LANGS[body.lang] || LANGS.English;
  const data = JSON.stringify(body.payload || null);
  if (!task || data.length > MAX_PAYLOAD_CHARS) return res.status(400).json({ error: 'Bad request' });
  const t = task(lang);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5',
        max_tokens: 1500,
        system: t.system,
        messages: [{ role: 'user', content: t.user + data }]
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!r.ok) return res.status(502).json({ error: 'Upstream error' });
    const j = await r.json();
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'Upstream error' });
  }
};
