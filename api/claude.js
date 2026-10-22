// Vercel serverless function. Holds the AI key so it never reaches the browser.
// Works with either provider, whichever key is set:
//   OPENROUTER_API_KEY  (optional AI_MODEL, e.g. google/gemini-2.5-flash; check the exact name on OpenRouter)
//   GEMINI_API_KEY      (optional GEMINI_MODEL; check the exact name in Google AI Studio)
// Set it in Vercel > Project > Settings > Environment Variables (locally: set it in your shell).
// The browser sends a task name and the data; the prompt is built here, so this endpoint
// can't be used as a general-purpose proxy for the key.
const MAX_PAYLOAD_CHARS = 8000;
const LANGS = { English: 'English', Hindi: 'Hindi (Devanagari script)', Kannada: 'Kannada (Kannada script)' };

const RULES = 'You write for a small restaurant owner in India. Use plain, short sentences. ' +
  'Use ONLY the numbers in the data. Do not add, remove, round differently or calculate any number. Write every number with the digits 0-9 exactly as given, including \u20B9 and %. Keep times like "7 pm" as written. ' +
  'Never say a platform overcharged, made a mistake or did anything wrong. Do not guess causes. Anything marked as an estimate stays an estimate.';

const TASKS = {
  phrase: lang => ({
    system: RULES,
    user: 'Re-word each field below in ' + lang + ' so an owner understands it at a glance. Keep the meaning and every number. ' +
      'Reply with JSON only, with exactly the same keys, and nothing else.\n\nDATA:\n'
  }),
  ask: lang => ({
    system: RULES + ' If the data does not contain an answer, say so plainly. Never infer a cause from a comparison. Keep estimates clearly labelled.',
    user: 'Answer the restaurant owner in ' + lang + ' in 2 to 4 short sentences. Answer only from the calculated metrics below. Use numbers exactly as shown, distinguish estimates, and do not suggest a cause unless the data proves it (normally it does not). If the question cannot be answered from these metrics, say what is missing.\n\nQUESTION AND VERIFIED METRICS:\n'
  }),
  draft: () => ({
    system: RULES,
    user: 'Write a short, polite message from a restaurant partner to Swiggy partner support asking them to explain the item below. ' +
      'Ask them to confirm the basis and reply in writing. Include the order IDs if any. Keep [Restaurant name], [Restaurant ID], [Your name] and [Phone] exactly as written. ' +
      'Plain text in English with a subject line, under 150 words.\n\nDATA:\n'
  })
};

async function viaOpenRouter(key, t, data) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'google/gemini-2.5-flash',
      max_tokens: 1500,
      temperature: 0.2,
      messages: [{ role: 'system', content: t.system }, { role: 'user', content: t.user + data }]
    }),
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) return null;
  const j = await r.json();
  const m = j.choices && j.choices[0] && j.choices[0].message;
  return m && typeof m.content === 'string' ? m.content.trim() : null;
}

async function viaGemini(key, t, data, isPhrase) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const generationConfig = { maxOutputTokens: 1500, temperature: 0.2 };
  if (isPhrase) generationConfig.responseMimeType = 'application/json';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: t.system }] },
      contents: [{ role: 'user', parts: [{ text: t.user + data }] }],
      generationConfig
    }),
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) return null;
  const j = await r.json();
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  return parts.map(p => p.text || '').join('\n').trim() || null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const orKey = process.env.OPENROUTER_API_KEY, gKey = process.env.GEMINI_API_KEY;
  if (!orKey && !gKey) return res.status(503).json({ error: 'AI not configured' }); // the page falls back to templates
  const body = req.body || {};
  const task = TASKS[body.task];
  const lang = LANGS[body.lang] || LANGS.English;
  const data = JSON.stringify(body.payload || null);
  if (!task || data.length > MAX_PAYLOAD_CHARS) return res.status(400).json({ error: 'Bad request' });
  const t = task(lang);
  try {
    const text = orKey ? await viaOpenRouter(orKey, t, data) : await viaGemini(gKey, t, data, body.task === 'phrase');
    if (!text) return res.status(502).json({ error: 'Upstream error' });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'Upstream error' });
  }
};
