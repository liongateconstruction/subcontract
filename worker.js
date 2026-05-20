// LIONGATE AI Proxy - Cloudflare Worker
// Защищает API-ключ Anthropic + ограничивает частоту запросов
//
// УСТАНОВКА:
// 1. Зарегистрируйтесь на dash.cloudflare.com (бесплатно)
// 2. Workers & Pages -> Create -> Create Worker
// 3. Скопируйте этот файл в редактор
// 4. Settings -> Variables -> Add: ANTHROPIC_API_KEY = ваш ключ (Secret)
// 5. Settings -> Variables -> Add: ALLOWED_ORIGIN = https://ваш-домен.com
// 6. Deploy. Скопируйте URL воркера.

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-LG-Token',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Only POST allowed' }, 405, allowedOrigin);
    }

    // Простая защита от чужих вызовов
    const token = request.headers.get('X-LG-Token');
    if (env.LG_SHARED_TOKEN && token !== env.LG_SHARED_TOKEN) {
      return jsonResponse({ error: 'Unauthorized' }, 401, allowedOrigin);
    }

    // Лимит по IP — 200 запросов в день (с большим запасом для группы 5 партнёров)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.RATE_LIMIT_KV) {
      const todayKey = `${ip}:${new Date().toISOString().slice(0,10)}`;
      const cur = parseInt(await env.RATE_LIMIT_KV.get(todayKey) || '0');
      if (cur >= 200) {
        return jsonResponse({ error: 'Daily limit exceeded' }, 429, allowedOrigin);
      }
      await env.RATE_LIMIT_KV.put(todayKey, String(cur + 1), { expirationTtl: 86400 });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON' }, 400, allowedOrigin);
    }

    // Защита от слишком больших запросов
    if (JSON.stringify(body).length > 50000) {
      return jsonResponse({ error: 'Request too large' }, 413, allowedOrigin);
    }

    // Защита от использования дорогих моделей
    const ALLOWED_MODELS = ['claude-haiku-4-5-20251001', 'claude-haiku-4-5'];
    if (body.model && !ALLOWED_MODELS.includes(body.model)) {
      body.model = 'claude-haiku-4-5-20251001';
    }
    if (!body.model) body.model = 'claude-haiku-4-5-20251001';

    // Лимит max_tokens чтобы не разорить
    if (!body.max_tokens || body.max_tokens > 1024) body.max_tokens = 1024;

    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });

      const result = await upstream.json();
      return jsonResponse(result, upstream.status, allowedOrigin);
    } catch (e) {
      return jsonResponse({ error: 'Upstream error', detail: String(e) }, 502, allowedOrigin);
    }
  }
};

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-LG-Token'
    }
  });
}
