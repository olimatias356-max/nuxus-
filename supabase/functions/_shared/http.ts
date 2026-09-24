// Shared HTTP helpers for Edge Functions.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function fail(status: number, error: string): Response {
  return json({ error }, status);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps a handler with CORS preflight, method check, body size limit and error mapping. */
export function handler(fn: (req: Request) => Promise<Response>, opts: { maxBody?: number } = {}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return fail(405, 'Método no permitido');
    const length = Number(req.headers.get('content-length') ?? '0');
    if (length > (opts.maxBody ?? 64 * 1024)) return fail(413, 'Solicitud demasiado grande');
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message);
      console.error(e);
      return fail(500, 'Error interno. Probá de nuevo más tarde.');
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}
