// Drains the push queue through the Expo Push API. Triggered by the database
// (pg_net, header x-push-secret) or on a schedule with the service role key.
import { safeEqual } from '../_shared/crypto.ts';
import { fail, handler, json } from '../_shared/http.ts';
import { rpc } from '../_shared/supabase.ts';

type Item = { id: number; title: string; body: string; data: Record<string, unknown>; tokens: string[] };
type Ticket = { status: 'ok' | 'error'; details?: { error?: string } };

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

Deno.serve(
  handler(async (req) => {
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const secret = req.headers.get('x-push-secret') ?? '';
    const allowed = (service && safeEqual(bearer, service)) || (secret && (await rpc<boolean>('svc_check_push_secret', { p_secret: secret })));
    if (!allowed) return fail(401, 'unauthorized');

    const items = await rpc<Item[]>('svc_claim_push_batch', { p_limit: 300 });
    const messages: Array<{ to: string; title: string; body: string; data: Record<string, unknown>; sound: 'default'; channelId: string; itemId: number }> = [];
    for (const item of items ?? []) {
      for (const to of item.tokens) {
        messages.push({ to, title: item.title, body: item.body, data: item.data, sound: 'default', channelId: 'default', itemId: item.id });
      }
    }

    const sent = new Set<number>();
    const dead: string[] = [];
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH, { method: 'POST', headers, body: JSON.stringify(chunk.map(({ itemId: _, ...m }) => m)) }).catch(() => null);
      if (!res?.ok) continue; // retried on the next run (max 3 attempts)
      const { data: tickets = [] } = (await res.json()) as { data?: Ticket[] };
      tickets.forEach((t, j) => {
        const msg = chunk[j];
        if (!msg) return;
        if (t.status === 'ok') sent.add(msg.itemId);
        else if (t.details?.error === 'DeviceNotRegistered') {
          dead.push(msg.to);
          sent.add(msg.itemId);
        }
      });
    }
    // items with no devices left are done too
    for (const item of items ?? []) if (!item.tokens.length) sent.add(item.id);

    await rpc('svc_finish_push', { p_sent: [...sent], p_dead_tokens: dead });
    return json({ claimed: items?.length ?? 0, messages: messages.length, sent: sent.size, removed_tokens: dead.length });
  }),
);
