// Cloudflare Worker - R2 Upload Proxy
// Bu worker CORS muammosini hal qiladi

export default {
  async fetch(request, env) {
    // CORS headerlar
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    // OPTIONS so'rovi (preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname.slice(1); // /videos/... -> videos/...

    try {
      // Fayl yuklash (PUT)
      if (request.method === 'PUT') {
        const body = await request.arrayBuffer();
        const contentType = request.headers.get('content-type') || 'application/octet-stream';
        
        await env.R2_BUCKET.put(path, body, {
          httpMetadata: { contentType }
        });

        const publicUrl = `https://pub-271e3540fa7f4b0a85bfcf9bb56b3ae2.r2.dev/${path}`;
        
        return new Response(JSON.stringify({ ok: true, url: publicUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Fayl olish (GET)
      if (request.method === 'GET') {
        const object = await env.R2_BUCKET.get(path);
        if (!object) {
          return new Response('Not found', { status: 404, headers: corsHeaders });
        }
        return new Response(object.body, {
          headers: {
            ...corsHeaders,
            'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
          }
        });
      }

      return new Response('Method not allowed', { status: 405, headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
