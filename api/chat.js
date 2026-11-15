// Vercel serverless function: forwards chat requests to an Azure AI Foundry deployment.
// The endpoint, key and deployment come from the page's inputs on each request; nothing is stored or logged.
// Only Azure AI hosts are allowed, so this cannot be used as an open proxy.
const ALLOWED_HOST = /^[a-z0-9-]+\.(services\.ai\.azure\.com|openai\.azure\.com|cognitiveservices\.azure\.com)$/i;

const clamp = (n, lo, hi, d) => (Number.isFinite(+n) ? Math.min(hi, Math.max(lo, +n)) : d);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  let url;
  try { url = new URL(String(body.endpoint || '')); } catch { return res.status(400).json({ error: 'Endpoint is not a valid URL.' }); }
  if (url.protocol !== 'https:' || !ALLOWED_HOST.test(url.hostname)) {
    return res.status(400).json({ error: 'Endpoint must be an https Azure AI host (*.services.ai.azure.com, *.openai.azure.com or *.cognitiveservices.azure.com).' });
  }
  const key = String(body.key || '');
  const deployment = String(body.deployment || '').slice(0, 128);
  if (!key || !deployment) return res.status(400).json({ error: 'API key and deployment are required.' });

  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-10)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!msgs.length) return res.status(400).json({ error: 'No message.' });
  const system = typeof body.system === 'string' ? body.system.slice(0, 2000) : '';
  const messages = system ? [{ role: 'system', content: system }, ...msgs] : msgs;

  try {
    const r = await fetch(`https://${url.hostname}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({
        model: deployment,
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
    return res.status(200).json({ content: choice.message?.content || '', finish_reason: choice.finish_reason, usage: data.usage, model: data.model || deployment });
  } catch {
    return res.status(502).json({ error: 'Could not reach Azure AI Foundry.' });
  }
};
