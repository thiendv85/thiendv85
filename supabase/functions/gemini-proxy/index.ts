// Supabase Edge Function: gemini-proxy
// Proxies Gemini API calls server-side so the GEMINI_API_KEY never reaches the browser.
//
// Deploy:
//   supabase functions deploy gemini-proxy
//   supabase secrets set GEMINI_API_KEY=...
//
// Required secrets: GEMINI_API_KEY

// deno-lint-ignore-file no-explicit-any

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim());

function corsHeaders(origin: string | null) {
  const allowed =
    ALLOWED_ORIGINS.includes('*') || (origin && ALLOWED_ORIGINS.includes(origin)) ? origin ?? '*' : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Require an authenticated caller
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: GEMINI_API_KEY missing' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const prompt = String(body?.prompt ?? '').slice(0, 8000);
  const model = String(body?.model ?? 'gemini-2.0-flash-exp').replace(/[^a-zA-Z0-9.-]/g, '');
  const responseMimeType = body?.responseMimeType === 'application/json' ? 'application/json' : 'text/plain';

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType },
    }),
  });

  if (!upstream.ok) {
    const txt = await upstream.text();
    return new Response(JSON.stringify({ error: 'Upstream error', detail: txt.slice(0, 500) }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const json = await upstream.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
