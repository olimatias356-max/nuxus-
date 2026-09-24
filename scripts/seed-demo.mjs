#!/usr/bin/env node
// Creates demo creators with generated photos, follows, likes, comments and
// stories so the app has content to show. ONLY for local/staging projects.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo.mjs
//
// Uses the service role key only to create confirmed users (admin API);
// everything else is done as each demo user, through RLS.
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let createClient;
try {
  ({ createClient } = require('@supabase/supabase-js'));
} catch {
  ({ createClient } = require('../tests/e2e/node_modules/@supabase/supabase-js'));
}

const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY ?? SERVICE;
if (!SERVICE) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (/supabase\.co/.test(URL_) && process.env.SEED_PRODUCTION !== 'yes') {
  console.error('Parece un proyecto hosteado. Si de verdad querés cargar datos demo, usá SEED_PRODUCTION=yes.');
  process.exit(1);
}
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo2026!mbarete';

// ------------------------------------------------------------ tiny PNG encoder
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const i = y * (width * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// Ñandutí-inspired lace: radial rings and spokes over a gradient.
function art(w, h, c1, c2, seed) {
  const A = hex(c1), Bc = hex(c2);
  const cx = w * (0.3 + (seed % 5) * 0.1), cy = h * (0.35 + (seed % 3) * 0.1);
  const spokes = 12 + (seed % 4) * 4;
  return png(w, h, (x, y) => {
    let col = mix(A, Bc, (x / w) * 0.4 + (y / h) * 0.6);
    const dx = x - cx, dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx);
    const ring = Math.abs(Math.sin(r / (18 + (seed % 3) * 4)));
    const spoke = Math.abs(Math.sin((ang * spokes) / 2));
    if (r < w * 0.55 && (ring > 0.96 || (spoke > 0.985 && r > 30))) col = mix(col, [255, 255, 255], 0.55);
    if (r < 26) col = mix(col, [255, 255, 255], 0.85);
    return col;
  });
}

const CREATORS = [
  { username: 'lucia.py', name: 'Lucía Benítez', bio: 'Cultura paraguaya y tereré 🧉', colors: ['#3D5AFE', '#00B8D4'], cat: 'cultura', captions: ['Tereré perfecto en 30 segundos 🧉', 'Así se teje un ñandutí, paso a paso', 'Atardecer en la Costanera de Asunción'] },
  { username: 'dona.rosa', name: 'Doña Rosa', bio: 'Recetas de la abuela 🇵🇾', colors: ['#FFB300', '#FF5252'], cat: 'cocina', captions: ['Sopa paraguaya: la receta que no falla', 'Chipa recién salida del tatakua', 'Mbejú crocante para la merienda'] },
  { username: 'futbol.cde', name: 'Fútbol CDE', bio: 'Goles y jugadas del Este ⚽', colors: ['#00C853', '#2979FF'], cat: 'deportes', captions: ['Golazo desde media cancha ⚽', 'Entrenamiento de la sub-17', 'Así se vive un clásico en el Este'] },
  { username: 'chila.dev', name: 'Chila Dev', bio: 'Apps hechas en Paraguay 💻', colors: ['#7C4DFF', '#FF4FD8'], cat: 'tecnologia', captions: ['Mi setup para crear apps desde Paraguay 💻', 'Tip: cómo proteger tus datos en el celular', 'Lanzamos nueva versión 🚀'] },
  { username: 'arpa.luque', name: 'Arpa de Luque', bio: 'Música paraguaya en vivo 🎶', colors: ['#FF3B6B', '#7C4DFF'], cat: 'musica', captions: ['Pájaro Campana en vivo 🎶', 'Detrás de escena del ensayo', 'Nueva guarania, ¿qué les parece?'] },
  { username: 'viajes.py', name: 'Viajá Paraguay', bio: 'Rincones para descubrir 🌿', colors: ['#00B8D4', '#00C853'], cat: 'viajes', captions: ['Saltos del Monday desde arriba', 'Un finde en San Bernardino', 'El Chaco como nunca lo viste'] },
];

async function ensureUser(c) {
  const email = `${c.username.replace('.', '_')}@demo.mbaretefans.local`;
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { username: c.username, display_name: c.name, birth_date: '1994-03-10', country: 'PY', terms_version: '2026-09' },
    });
    if (error) throw error;
    user = data.user;
  }
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { ...c, id: user.id, email, client };
}

async function upload(client, bucket, userId, buf) {
  const path = `${userId}/${crypto.randomUUID()}.png`;
  const { error } = await client.storage.from(bucket).upload(path, buf, { contentType: 'image/png' });
  if (error) throw error;
  return path;
}

const users = [];
for (const [i, c] of CREATORS.entries()) {
  const u = await ensureUser(c);
  const { data: existing } = await u.client.from('posts').select('id').eq('author_id', u.id);
  if (!existing?.length) {
    const avatar = await upload(u.client, 'avatars', u.id, art(320, 320, c.colors[1], c.colors[0], i + 7));
    await u.client.from('profiles').update({ bio: c.bio, avatar_path: avatar }).eq('id', u.id);
    for (const [j, caption] of c.captions.entries()) {
      const tall = j % 2 === 0;
      const media = await upload(u.client, 'media', u.id, art(720, tall ? 900 : 720, c.colors[j % 2], c.colors[(j + 1) % 2], i * 3 + j));
      const { error } = await u.client.from('posts').insert({ kind: 'image', media_path: media, caption, category: c.cat, width: 720, height: tall ? 900 : 720 });
      if (error) throw error;
    }
    const story = await upload(u.client, 'media', u.id, art(540, 960, c.colors[0], '#0A0A0F', i + 3));
    await u.client.from('stories').insert({ kind: 'image', media_path: story, caption: c.captions[0] });
  }
  users.push(u);
  console.log('✓', c.username);
}

// social graph: everyone follows a few others, likes and comments
const comments = ['¡Qué bueno! 🔥', 'Mbarete 💪', 'Me encantó', 'Quiero probarlo', 'Excelente contenido', '¡Vamos Paraguay! 🇵🇾'];
for (const [i, u] of users.entries()) {
  for (let k = 1; k <= 3; k++) {
    const other = users[(i + k) % users.length];
    await u.client.from('follows').insert({ followee_id: other.id });
    const { data: posts } = await u.client.from('posts').select('id').eq('author_id', other.id);
    for (const [j, p] of (posts ?? []).entries()) {
      await u.client.from('likes').insert({ post_id: p.id });
      if ((i + j + k) % 3 === 0) await u.client.from('comments').insert({ post_id: p.id, body: comments[(i + j) % comments.length] });
    }
  }
}
console.log(`\nListo: ${users.length} creadores demo. Contraseña: ${PASSWORD}`);
console.log('Emails:', users.map((u) => u.email).join(', '));
