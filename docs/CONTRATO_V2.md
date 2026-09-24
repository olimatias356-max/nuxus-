# MbareteFans · Contrato técnico v2 (monetización por publicidad)

Fuente de verdad compartida por backend, Edge Functions, app y web. Si algo de acá
cambia, se cambia primero en este archivo.

## 0. Decisiones de producto (directiva de Dirección)

1. **No existe Pro ni ninguna suscripción.** Publicar y retirar es gratis.
2. **Monetización por publicidad (Google AdMob)**, modelo tipo YouTube:
   - Requisitos para activarla: **1.000 seguidores válidos** y **2.000 horas de reproducción válidas** (últimos 365 días).
   - Antes de activarla, el 100 % del ingreso publicitario es de la plataforma; el creador ve `0`.
   - Al activarla, el ingreso de los anuncios asociados a su contenido se reparte **50 % plataforma / 50 % creador**, **solo desde `activated_at`** (no retroactivo).
   - El porcentaje vive en `app_config` con `is_public = false`. **Nunca se muestra en la app** ni se expone por la API a clientes.
3. **App** = red social (fotos, videos, reels, historias, chat). **Web** = landing + guías + portal de creadores (métricas avanzadas, datos de cobro dLocal, solicitud de retiros).
4. **Retiros vía dLocal**, procesados en la ventana **21 al 26 de cada mes** (alineada con el pago de AdMob). Las fechas se calculan en hora de Paraguay con desfase fijo UTC-3 (vigente todo el año desde octubre de 2024).
5. **Antifraude obligatorio:** pausa en segundo plano, detección de bloqueadores de anuncios, depuración automática de bots/granjas, huella de dispositivo y límites por IP.
6. KYC se mantiene: da el check azul ✓ y es requisito legal para cobrar vía dLocal.

## 1. Se elimina

- Tablas `plans`, `subscriptions`, `private.subscription_events`.
- Funciones `svc_apply_subscription`, `private.is_pro`, `private.is_pro_public` y la bonificación Pro del feed (`feed.pro_bonus`).
- El requisito Pro en `request_payout` y el bloqueo `pro_required`.
- Membresías (no están en la directiva): sin UI; el valor `membership` puede quedar en el enum del ledger.
- Edge Functions `purchase-verify`, `billing-webhook` y `_shared/stores.ts`.
- En la app: `creator/pro.tsx`, `lib/purchases.ts`, dependencia y plugin `expo-iap`, y toda mención a "Pro".
- `get_my_monetization()` se reemplaza por `get_my_wallet()`.

## 2. Configuración (`public.app_config`)

| key | valor inicial | público |
|---|---|---|
| `monetization.min_followers` | `1000` | sí |
| `monetization.min_watch_hours` | `2000` | sí |
| `monetization.watch_window_days` | `365` | sí |
| `revenue.ads_creator_share` | `0.50` | **no** |
| `payout.min_amount` | `{"PYG":50000,"ARS":500000,"BRL":5000}` | sí |
| `payout.window_start_day` | `21` | sí |
| `payout.window_end_day` | `26` | sí |
| `payout.bank_change_cooldown_hours` | `24` | sí |
| `antifraud.max_accounts_per_device` | `3` (en 30 días) | no |
| `antifraud.max_accounts_per_ip_day` | `10` | no |
| `antifraud.min_account_age_hours` | `24` | no |
| `antifraud.max_plays_per_viewer_post_day` | `3` | no |
| `antifraud.max_watch_hours_per_viewer_day` | `8` | no |
| `antifraud.farm_min_accounts` | `5` | no |
| `antifraud.max_impressions_per_viewer_hour` | `40` | no |
| `limits.watch_starts_per_minute` | `60` | no |
| `limits.heartbeats_per_minute` | `30` | no |
| `limits.ad_impressions_per_hour` | `60` | no |
| `ads.reward_ad_free_minutes` | `30` | sí |

## 3. Tablas nuevas o modificadas

Todas con RLS; los clientes **leen lo suyo** y **nunca escriben directo** (solo por RPC).

- `public.devices` — `id uuid pk`, `user_id`, `device_hash text` (sha-256 hex, 64 chars), `platform ('ios','android','web')`, `model`, `os_version`, `app_version`, `first_seen_at`, `last_seen_at`, `last_ip`, `unique(user_id, device_hash)`.
- `private.account_risk` — `user_id pk`, `score int`, `flags text[]` (`device_farm`, `ip_farm`, `bot_pattern`, `new_account`…), `trusted boolean`, `updated_at`.
- `public.watch_sessions` — `id uuid pk`, `post_id`, `viewer_id`, `creator_id`, `device_id`, `started_at`, `last_heartbeat_at`, `watched_ms int`, `duration_ms int`, `ads_ok boolean default true`, `status ('pending','valid','invalid') default 'pending'`, `invalid_reason text`, `monetizable boolean default true`. Solo videos; nunca el propio contenido.
- `public.ad_impressions` — `id uuid pk`, `viewer_id`, `creator_id`, `post_id`, `session_id null`, `format ('native','interstitial','rewarded','banner')`, `ad_unit text`, `value_micros bigint` (estimado informado por el SDK, **no confiable**), `currency`, `precision`, `verified boolean` (true solo vía SSV), `ssv_transaction_id text unique`, `device_id`, `status ('pending','valid','invalid')`, `invalid_reason`, `distribution_id uuid null`, `created_at`.
- `public.creator_monetization` — `user_id pk`, `status ('locked','eligible','active','suspended')`, `eligible_at`, `activated_at`, `suspended_reason`, `updated_at`.
- `private.ad_revenue_imports` — `id uuid pk`, `period_start date`, `period_end date`, `source 'admob'`, `currency`, `gross_micros bigint`, `fx_rates jsonb`, `external_ref text unique`, `status ('pending','released')`, `imported_at`, `released_at`, `imported_by`.
- `private.ad_free_until` — `user_id pk`, `until timestamptz` (premio de anuncios bonificados).
- `public.wallet_ledger` agrega `base_currency char(3)`, `base_amount bigint` (micros), `exchange_rate numeric` (nunca se sobrescribe el monto original).
- `public.bank_accounts` (cuenta de cobro dLocal) agrega `bank_code`, `branch`, `document_type`, `document_last4`, `country`; `private.bank_account_secrets` agrega `document_number_enc`.
- `public.payouts`: estados `REQUESTED → PROCESSING → PAID | FAILED | REVERSED`; agrega `scheduled_for date` y `email_snapshot` no (el email se toma en el servidor).

## 4. RPC para clientes (`authenticated`)

| función | devuelve | notas |
|---|---|---|
| `register_device(p_device_hash text, p_platform text, p_model text, p_os_version text, p_app_version text)` | `uuid` (device id) | Guarda IP (header `x-forwarded-for`). Aplica reglas de granjas (§6). |
| `start_watch(p_post uuid, p_device uuid)` | `uuid` o `null` | `null` si no es video, no visible o es propio. Cuenta la vista para ranking (1 por viewer/post/hora). |
| `heartbeat_watch(p_session uuid, p_watched_ms integer, p_ads_ok boolean)` | `void` | `p_watched_ms` = delta desde el último heartbeat, `0..30000`; el servidor recorta al tiempo real transcurrido y a `duration_ms × 1.05`. Solo el dueño de la sesión. |
| `log_ad_impression(p_post uuid, p_format text, p_ad_unit text, p_value_micros bigint, p_currency text, p_precision text, p_device uuid, p_session uuid default null)` | `uuid` | El creador se deduce del post en el servidor. Rate limit. |
| `get_ad_state()` | `jsonb {ad_free_until}` | |
| `get_monetization_progress()` | `jsonb` (ver abajo) | |
| `activate_monetization()` | `jsonb` progreso | Error si no cumple requisitos o cuenta restringida. |
| `get_my_wallet()` | `jsonb` (ver abajo) | **Sin porcentajes.** |
| `get_creator_analytics(p_days integer default 28)` | `jsonb` (ver abajo) | Para el portal web. |
| `upsert_payout_account(p_bank_name text, p_bank_code text, p_account_type text, p_holder_name text, p_account_number text, p_document_type text, p_document_number text, p_branch text default null)` | `uuid` | Reemplaza `upsert_bank_account`. Cifra cuenta y documento. Auto-verifica si el titular coincide con el KYC verificado. |
| `request_payout(p_amount bigint default null)` | `uuid` | Requisitos: KYC `VERIFIED`, cuenta de cobro verificada y fuera del período de enfriamiento, sin otro retiro abierto, `AVAILABLE ≥ mínimo`. Estado `REQUESTED`, `scheduled_for` = próxima ventana 21–26. Mueve `AVAILABLE → PROCESSING` en el ledger. |

Se mantienen: `submit_kyc`, `get_creator_stats`, `track_view` (fotos), todas las RPC sociales.

`get_monetization_progress()`:
```json
{ "status": "locked|eligible|active|suspended", "activated_at": null,
  "followers": 812, "followers_required": 1000,
  "watch_hours": 1532.4, "watch_hours_required": 2000,
  "can_activate": false }
```

`get_my_wallet()`:
```json
{ "currency": "PYG", "currency_decimals": 0,
  "monetization": { "...": "igual a get_monetization_progress" },
  "available": 210000, "pending": 90000, "processing": 0, "paid_total": 140000,
  "payout_min": 50000,
  "next_payout_window": { "start": "2026-10-21", "end": "2026-10-26" },
  "kyc_status": "VERIFIED",
  "payout_account": { "bank_name": "…", "holder_name": "…", "last4": "3456", "account_type": "savings", "status": "verified", "updated_at": "…" },
  "payouts": [ { "id": "…", "amount": 140000, "currency": "PYG", "status": "PAID", "requested_at": "…", "scheduled_for": "2026-09-21", "updated_at": "…" } ],
  "withdraw_blockers": ["kyc_required"] }
```
`withdraw_blockers` ∈ `account_restricted, kyc_required, payout_account_required, payout_account_unverified, payout_account_cooldown, payout_in_progress, insufficient_available`.
`pending` = suma de buckets `ESTIMATED + PENDING + CONFIRMED`; `available` = `AVAILABLE`.

`get_creator_analytics(p_days)`:
```json
{ "daily": [ { "day": "2026-09-01", "views": 120, "watch_hours": 3.2, "new_followers": 4, "impressions": 80 } ],
  "totals": { "views": 0, "watch_hours": 0, "followers": 0, "impressions_valid": 0 },
  "invalid_traffic": { "sessions": 0, "watch_hours": 0, "impressions": 0 },
  "top_posts": [ { "id": "…", "kind": "video", "thumb_path": "…", "media_path": "…", "caption": "…", "views": 0, "watch_hours": 0, "likes": 0 } ] }
```

Admin (rol `FINANCE`): `admin_import_ad_revenue(p_period_start date, p_period_end date, p_gross_micros bigint, p_currency text, p_fx_rates jsonb, p_external_ref text) returns uuid`, `admin_release_ad_revenue(p_import uuid) returns integer`, `admin_list_revenue_imports() returns setof jsonb`. Rol `SECURITY`: `admin_fraud_overview() returns jsonb`.

## 5. RPC solo servidor (`service_role`, usadas por Edge Functions)

- `svc_record_ssv_reward(p_transaction_id text, p_user uuid, p_post uuid, p_ad_unit text, p_reward_item text, p_reward_amount integer, p_timestamp_ms bigint) returns uuid` — idempotente por `transaction_id`; crea impresión `rewarded`, `verified = true`, `status = 'valid'`, y extiende `ad_free_until` del usuario.
- `svc_import_ad_revenue(...)` (misma firma que la admin) y `svc_release_ad_revenue(p_import uuid)`.
- `svc_run_fraud_checks() returns jsonb` — ejecutar cada hora (§6).
- `svc_payouts_due(p_limit integer default 100)` → `table(payout_id uuid, user_id uuid, amount bigint, currency text, country text, email text, holder_name text, document_type text, document_number text, bank_name text, bank_code text, branch text, account_type text, account_number text)` — pagos `REQUESTED` con `scheduled_for <= hoy` **y** hoy dentro de la ventana 21–26. Descifra datos solo acá.
- `svc_mark_payout_sent(p_payout uuid, p_provider_ref text)` → `REQUESTED → PROCESSING`.
- `svc_complete_payout(p_payout uuid, p_status text, p_provider text, p_provider_ref text, p_failure_reason text default null)` → acepta desde `REQUESTED` o `PROCESSING`; `PAID` mueve `PROCESSING → PAID`; `FAILED` devuelve `PROCESSING → AVAILABLE`. Idempotente.

## 6. Reglas antifraude (backend)

Cliente: pausa video y anuncios en segundo plano; heartbeats solo con la app activa y el video reproduciéndose; `ads_ok = false` si el SDK de anuncios falla repetidamente por red/bloqueo (no por "no fill").

`register_device`: si el `device_hash` tiene más de `max_accounts_per_device` cuentas en 30 días → flag `device_farm` para las cuentas nuevas de ese dispositivo. Si una IP registra más de `max_accounts_per_ip_day` cuentas nuevas en 24 h → flag `ip_farm`. Cuentas marcadas quedan `trusted = false`.

`svc_run_fraud_checks()` (idempotente, sobre los últimos 7 días):
1. Sesiones de espectadores no confiables o con cuenta de menos de `min_account_age_hours` → `invalid (untrusted_viewer)`.
2. Más de `max_plays_per_viewer_post_day` sesiones por espectador/post/día → excedente `invalid (loop)`.
3. Más de `max_watch_hours_per_viewer_day` por espectador/día → excedente `invalid (excess_daily)`.
4. Granja: `farm_min_accounts` o más cuentas que comparten `device_hash` o IP mirando al mismo creador en 24 h → `invalid (farm)`.
5. Patrón bot: 10+ sesiones del mismo espectador con `watched_ms` idéntico → `invalid (bot_pattern)` y flag de riesgo.
6. `ads_ok = false` → `monetizable = false (adblock)`; no suma horas para requisitos ni ingresos.
7. Impresiones de espectadores no confiables, sobre `max_impressions_per_viewer_hour`, o sin sesión/actividad real → `invalid`.
8. Sesiones `pending` con más de 1 h que pasan todo → `valid`.
9. Si impresiones ya distribuidas pasan a `invalid` → asiento `debit` automático (fuente `ads`, "Ajuste por tráfico inválido") en el ledger del creador.
10. Recalcula `creator_monetization`: `locked ↔ eligible` según requisitos (no desactiva a un `active` salvo suspensión por moderación/fraude).

Contadores de horas y seguidores válidos se **derivan** de sesiones/seguidores válidos: al invalidar, se descuentan solos del panel.

## 7. Ingresos y ledger

1. La app registra impresiones (`log_ad_impression`) y AdMob confirma las bonificadas por SSV.
2. Diariamente `admob-import` trae los ingresos reales de AdMob (API de reportes) → `svc_import_ad_revenue`: reparte el bruto del período entre creadores **activos** en proporción a sus impresiones **válidas** posteriores a `activated_at` (peso = `value_micros` si > 0, si no 1), aplica el 50 %, convierte a la moneda del creador con `fx_rates` (objeto plano: unidades de la moneda del creador por 1 unidad de `p_currency`, p. ej. `{"PYG":7300,"ARS":1150,"BRL":5.4}`; igual a `FX_RATES_JSON`) y acredita en bucket `PENDING` guardando `base_amount/base_currency/exchange_rate`. Referencia idempotente `admob:<import>:<creator>`. El mismo `external_ref` no se importa dos veces y un período que se superpone con otra importación se rechaza (`PT409`).
3. Cuando AdMob paga (21–26), Finanzas/cron ejecuta `release` → `PENDING → AVAILABLE`.
4. Retiros (§4) → dLocal (§8).

## 8. Pagos dLocal

- `dlocal-payouts` (cron diario; solo hace algo del 21 al 26): `svc_payouts_due` → Payouts API de dLocal → `svc_mark_payout_sent`.
- `payout-webhook?provider=dlocal`: verifica la firma de dLocal y llama `svc_complete_payout`. Se mantiene el modo HMAC genérico (`x-mbarete-timestamp` + `x-mbarete-signature`) para pruebas y otros proveedores.

## 9. Edge Functions

| función | auth | propósito |
|---|---|---|
| `admob-ssv` | pública (GET), firma ECDSA de Google | Callback SSV de anuncios bonificados. |
| `admob-import` | service role | Importa ingresos AdMob (OAuth refresh token). |
| `dlocal-payouts` | service role | Envía retiros en la ventana 21–26. |
| `payout-webhook` | firma | Resultado de retiros. |
| `delete-account`, `maintenance` (+ `svc_run_fraud_checks`), `push-dispatch` | como hoy | |

Variables: `ADMOB_CLIENT_ID`, `ADMOB_CLIENT_SECRET`, `ADMOB_REFRESH_TOKEN`, `ADMOB_PUBLISHER_ID`, `FX_RATES_JSON`, `DLOCAL_API_URL`, `DLOCAL_LOGIN`, `DLOCAL_TRANS_KEY`, `DLOCAL_SECRET_KEY`, `PAYOUT_WEBHOOK_SECRET`.

## 10. App (Expo)

- Tabs: **Inicio · Explorar · Crear (+) · Reels · Perfil**. Header de Inicio: logo a la izquierda; **campana** (notificaciones, badge) y **chat** (mensajes, badge) a la derecha. Actividad pasa a ser pantalla (`/activity`).
- Check azul ✓ consistente en perfil, historias (barra y visor), posts, reels, comentarios, chats e inbox.
- AdMob (`react-native-google-mobile-ads`): nativo en el feed cada 6 posts, anuncio entre reels cada 5, bonificado opcional "30 min sin anuncios" (SSV con `userId` = id de Supabase y `customData` = id del post). IDs de prueba de Google por defecto.
- Seguimiento de reproducción: `register_device` al iniciar sesión, `start_watch` + `heartbeat_watch` cada ~10 s solo en primer plano y reproduciendo; `AppState` pausa videos y anuncios.
- Panel de creador: progreso (seguidores y horas), botón "Activar monetización", saldo disponible, ganancias pendientes, historial de retiros y botón al portal web para retirar. **Sin porcentajes.**

## 11. Web (Next.js)

Landing, cómo funciona, guías, legales, portal (métricas, cuenta de cobro dLocal, retiros), SEO (metadata, `sitemap.xml`, `robots.txt`, verificación de Search Console, JSON-LD) y `app-ads.txt`.

## 12. Dueños de cada carpeta (trabajo en paralelo)

| área | carpetas |
|---|---|
| Backend & DB + antifraude | `supabase/migrations/**`, `supabase/tests/**`, `supabase/seed.sql` |
| Monetización (Edge Functions) | `supabase/functions/**`, secciones `[functions.*]` de `supabase/config.toml` |
| UI/UX app | `app/**` |
| Web + SEO | `web/**` |
| Coordinación | `docs/**`, `tests/e2e/**`, `scripts/**`, `README.md`, `.github/**` |
