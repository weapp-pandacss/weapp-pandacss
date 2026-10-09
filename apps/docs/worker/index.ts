interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

type RegionRequest = Request & { cf?: { country?: unknown } }

export default {
  fetch(request: RegionRequest, env: Env): Promise<Response> | Response {
    if (new URL(request.url).pathname !== '/api/locale') {
      return env.ASSETS.fetch(request)
    }
    const headers = { 'Cache-Control': 'private, no-store' }
    if (request.method !== 'GET') {
      return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } })
    }
    // Only trust Cloudflare's connection metadata, not spoofable HTTP headers.
    const country = request.cf?.country
    return Response.json({ country: typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : null }, { headers })
  },
}
