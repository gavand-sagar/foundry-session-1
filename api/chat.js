// Vercel serverless function: proxies chat requests to an Azure AI Foundry deployment.
// Env vars (set in Vercel → Settings → Environment Variables):
//   AZURE_AI_ENDPOINT    e.g. https://<resource>.services.ai.azure.com  (or https://<resource>.openai.azure.com)
//   AZURE_AI_KEY         the resource key (never sent to the browser)
//   AZURE_AI_DEPLOYMENT  deployment name, e.g. DeepSeek-V4.1-Flash or gpt-4o-mini
//   DEMO_PASSCODE        optional; if set, callers must send it
const ENDPOINT = (process.env.AZURE_AI_ENDPOINT || '').replace(/\/+$/, '');
const KEY = process.env.AZURE_AI_KEY || '';
const DEPLOYMENT = process.env.AZURE_AI_DEPLOYMENT || '';
const PASSCODE = process.env.DEMO_PASSCODE || '';

const clamp = (n, lo, hi, d) => (Number.isFinite(+n) ? Math.min(hi, Math.max(lo, +n)) : d);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    return res.status(200).json({ configured: !!(ENDPOINT && KEY && DEPLOYMENT), deployment: DEPLOYMENT || null, passcode: !!PASSCODE });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ENDPOINT || !KEY || !DEPLOYMENT) return res.status(503).json({ error: 'Azure AI Foundry is not configured on the server.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (PASSCODE && body.passcode !== PASSCODE) return res.status(401).json({ error: 'Wrong or missing demo passcode.' });

  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-10)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!msgs.length) return res.status(400).json({ error: 'No message.' });
  const system = typeof body.system === 'string' ? body.system.slice(0, 2000) : '';
  const messages = system ? [{ role: 'system', content: system }, ...msgs] : msgs;

  try {
    const r = await fetch(`${ENDPOINT}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': KEY },
      body: JSON.stringify({
        model: DEPLOYMENT,
        messages,
        temperature: clamp(body.temperature, 0, 1, 0.2),
        max_tokens: clamp(body.max_tokens, 16, 1000, 400),
      }),
    });
    const data = await r.json().catch(() => ({}));
    const err = data.error || {};
    if (err.code === 'content_filter' || err.innererror?.code === 'ResponsibleAIPolicyViolation') {
      const cats = Object.entries(err.innererror?.content_filter_result || {}).filter(([, v]) => v && v.filtered).map(([k]) => k);
      return res.status(200).json({ filtered: true, categories: cats });
    }
    if (!r.ok) return res.status(502).json({ error: err.message || `Azure returned ${r.status}` });
    const choice = data.choices?.[0] || {};
    if (choice.finish_reason === 'content_filter') return res.status(200).json({ filtered: true });
    return res.status(200).json({ content: choice.message?.content || '', finish_reason: choice.finish_reason, usage: data.usage, model: data.model || DEPLOYMENT });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach Azure AI Foundry.' });
  }
};
