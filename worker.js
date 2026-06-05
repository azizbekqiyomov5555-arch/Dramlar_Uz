// =====================================================
// Cloudflare Worker — B2 Upload Proxy
// Bu Worker ni https://crimson-poetry-188d.azizbekqiyomov55555.workers.dev ga deploy qiling
// Mavjud Worker kodingizga quyidagi /b2upload yo'nalishini qo'shing
// =====================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers — barcha so'rovlarga
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ===== /b2upload — B2 ga proxy yuklash =====
    if (url.pathname === '/b2upload' && request.method === 'POST') {
      try {
        const keyId   = request.headers.get('x-b2-key-id');
        const appKey  = request.headers.get('x-b2-app-key');
        const bucket  = request.headers.get('x-b2-bucket');
        const region  = request.headers.get('x-b2-region');
        const objKey  = request.headers.get('x-b2-key');
        const fileType = request.headers.get('x-file-type') || 'application/octet-stream';

        if (!keyId || !appKey || !bucket || !region || !objKey) {
          return new Response(JSON.stringify({ error: 'Kerakli headerlar yo\'q' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const fileBuffer = await request.arrayBuffer();

        // SHA-256 hisoblash
        const payloadHashBuf = await crypto.subtle.digest('SHA-256', fileBuffer);
        const payloadHash = toHex(new Uint8Array(payloadHashBuf));

        // Vaqt
        const now = new Date();
        const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
        const dateStamp = amzDate.slice(0, 8);

        const host = `s3.${region}.backblazeb2.com`;
        const uploadUrl = `https://${host}/${bucket}/${objKey}`;

        // Signature V4
        const canonHeaders = `content-type:${fileType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
        const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
        const canonReq = `PUT\n/${bucket}/${objKey}\n\n${canonHeaders}\n${signedHeaders}\n${payloadHash}`;
        const credScope = `${dateStamp}/${region}/s3/aws4_request`;
        const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${await sha256hex(canonReq)}`;

        const kDate    = await hmac('AWS4' + appKey, dateStamp);
        const kRegion  = await hmac(kDate, region);
        const kService = await hmac(kRegion, 's3');
        const kSign    = await hmac(kService, 'aws4_request');
        const signature = toHex(await hmac(kSign, strToSign));

        const authHeader = `AWS4-HMAC-SHA256 Credential=${keyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        // B2 ga yuklash
        const b2Resp = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Authorization': authHeader,
            'Content-Type': fileType,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
          },
          body: fileBuffer,
        });

        if (b2Resp.ok) {
          const publicUrl = `https://s3.${region}.backblazeb2.com/${bucket}/${objKey}`;
          return new Response(JSON.stringify({ url: publicUrl }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          const errText = await b2Resp.text();
          return new Response(JSON.stringify({ error: `B2 xato ${b2Resp.status}: ${errText.slice(0, 200)}` }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Boshqa yo'nalishlar — mavjud Worker logikangiz ishlaydi
    return new Response('Not found', { status: 404, headers: corsHeaders });
  }
};

// ===== Yordamchi funksiyalar =====
async function sha256hex(str) {
  const buf = typeof str === 'string' ? new TextEncoder().encode(str) : str;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return toHex(new Uint8Array(hash));
}

async function hmac(key, data) {
  const kb = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const db = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const k = await crypto.subtle.importKey('raw', kb, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, db));
}

function toHex(buf) {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}
