/**
 * Production Security Headers Middleware for Fastify.
 * Enforces Content-Security-Policy, anti-clickjacking, MIME sniffing guards, and Permissions-Policy.
 */
export function registerSecurityHeaders(fastify) {
  fastify.addHook('onSend', async (request, reply) => {
    // 1. Prevent MIME-sniffing
    reply.header('X-Content-Type-Options', 'nosniff');

    // 2. Clickjacking protection
    reply.header('X-Frame-Options', 'SAMEORIGIN');

    // 3. Referrer Policy
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 4. Permissions Policy (Restrict browser APIs)
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // 5. Content Security Policy (allows Stockfish 18 WASM web workers)
    const csp = [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss: http: https:",
      "worker-src 'self' blob:"
    ].join('; ');
    reply.header('Content-Security-Policy', csp);

    // 6. HSTS (Only when accessed via HTTPS in production)
    const isHttps = request.headers['x-forwarded-proto'] === 'https' || request.raw.socket.encrypted;
    if (process.env.NODE_ENV === 'production' && isHttps) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  });
}
