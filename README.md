# MbareteFans

Red social de fotos, videos, reels e historias para Paraguay y la región, con
monetización por publicidad para creadores (modelo tipo YouTube) y pagos vía dLocal.

| carpeta | qué es |
|---|---|
| `app/` | App móvil nativa (Expo SDK 57 + expo-router, iOS y Android; también exporta a web para pruebas). |
| `web/` | Sitio web (Next.js): landing, guías, legales, SEO y **portal de creadores** (métricas, cuenta de cobro dLocal y retiros). |
| `supabase/` | Base de datos (migraciones con RLS), pruebas pgTAP, Edge Functions (Deno) y plantillas de email. |
| `tests/e2e/` | Pruebas de punta a punta contra un Supabase local (las mismas llamadas que hacen la app y la web). |
| `scripts/` | `seed-demo.mjs`: carga creadores y contenido de demostración (solo local/staging). |
| `docs/CONTRATO_V2.md` | Contrato técnico compartido: tablas, RPC, reglas antifraude, flujo de ingresos y pagos. |

## Cómo funciona la monetización

- Publicar y retirar es **gratis**. No hay suscripciones ni planes pagos.
- Para activar la monetización un creador necesita **1.000 seguidores válidos** y **2.000 horas de
  reproducción válidas** en los últimos 12 meses. Antes de activarla, los ingresos de los anuncios son
  de la plataforma.
- Desde el momento de la activación (sin retroactividad) el ingreso de los anuncios asociados a su
  contenido se reparte con el creador. El porcentaje es configuración interna
  (`app_config.revenue.ads_creator_share`, no pública) y **no se muestra en la app**.
- Los anuncios son de **Google AdMob** (nativos en el feed, entre reels y bonificados con verificación
  del lado del servidor). Google paga a la plataforma entre el 21 y el 26 de cada mes; ese mismo rango es
  la ventana de retiros vía **dLocal**.
- **Antifraude:** la reproducción y los anuncios se pausan en segundo plano; si el SDK de anuncios está
  bloqueado la vista no se monetiza; un job horario (`svc_run_fraud_checks`) invalida loops, excesos,
  granjas de cuentas (huella de dispositivo e IP) y patrones de bot, y descuenta automáticamente horas,
  impresiones y, si ya se habían pagado, genera un ajuste en el saldo.

Detalle completo en [`docs/CONTRATO_V2.md`](docs/CONTRATO_V2.md).

## Seguridad

- Todas las tablas tienen RLS. Los clientes leen solo lo propio y **nunca escriben dinero, estados de
  monetización, sesiones ni impresiones directamente**: todo pasa por funciones `SECURITY DEFINER` con
  validación, límites de uso y `search_path` vacío.
- Libro contable de doble entrada, inmutable e idempotente. Cuentas bancarias y documentos cifrados
  (`pgp_sym_encrypt`); los números de documento de KYC se guardan como HMAC.
- Archivos privados (bucket `media` y `kyc`) servidos con URLs firmadas según la visibilidad del post y
  los bloqueos.
- La clave `service_role` solo vive en las Edge Functions. La app y la web usan la clave pública.
- Webhooks firmados (HMAC con marca de tiempo, y la firma de dLocal); callbacks de AdMob verificados con
  ECDSA contra las claves públicas de Google.

## Requisitos

- Node.js 22+, npm.
- [Supabase CLI](https://supabase.com/docs/guides/local-development) (con Docker) para el entorno local.
- Para la app nativa: una cuenta de [Expo/EAS](https://expo.dev). AdMob es un módulo nativo, así que
  la app se prueba con un **development build** (`eas build --profile development`), no con Expo Go.

## Puesta en marcha local

```bash
# 1. Backend
supabase start                      # levanta Postgres, Auth, Storage, Realtime, Mailpit…
supabase db reset                   # aplica supabase/migrations y supabase/seed.sql
supabase test db                    # pruebas pgTAP (RLS, dinero, antifraude)
cp supabase/functions/.env.example supabase/functions/.env   # completar valores
supabase functions serve --env-file supabase/functions/.env

# 2. Datos de demostración (opcional, solo local)
eval "$(supabase status -o env | sed 's/^/export /')"
SUPABASE_URL=$API_URL SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY SUPABASE_ANON_KEY=$ANON_KEY \
  node scripts/seed-demo.mjs        # contraseña de las cuentas demo: Demo2026!mbarete

# 3. App
cd app && cp .env.example .env      # EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY / …
npm install
npx expo start                      # con un development build instalado en el teléfono

# 4. Web
cd web && cp .env.example .env.local
npm install && npm run dev          # http://localhost:3000
```

Los códigos de verificación por email llegan a Mailpit (http://127.0.0.1:54324).

## Pruebas

| qué | comando |
|---|---|
| Base de datos (pgTAP) | `supabase test db` |
| Edge Functions | `deno check supabase/functions/*/index.ts && deno test supabase/functions/` |
| Punta a punta | `cd tests/e2e && npm ci && npm test -- api.test.mjs` (variables en el encabezado del archivo) |
| App | `cd app && npm run typecheck && npm run lint && npm test` |
| Web | `cd web && npm run lint && npm run typecheck && npm test && npm run build` |

La integración continua (`.github/workflows/ci.yml`) corre todo lo anterior en cada push.

## Producción

### Supabase
1. Crear el proyecto y vincularlo: `supabase link --project-ref <ref>`.
2. `supabase db push` para aplicar las migraciones.
3. En *Authentication*: confirmar email con código (plantillas en `supabase/templates/`), contraseña
   mínima 8 con mayúsculas, minúsculas y números, y las URLs de redirección `mbaretefans://**` y la de la web.
4. Secretos de las Edge Functions (`supabase secrets set …`), ver `supabase/functions/.env.example`:
   AdMob (`ADMOB_CLIENT_ID`, `ADMOB_CLIENT_SECRET`, `ADMOB_REFRESH_TOKEN`, `ADMOB_PUBLISHER_ID`),
   cotizaciones (`FX_RATES_JSON`), dLocal (`DLOCAL_API_URL`, `DLOCAL_LOGIN`, `DLOCAL_TRANS_KEY`,
   `DLOCAL_SECRET_KEY`) y `PAYOUT_WEBHOOK_SECRET`.
5. `supabase functions deploy` y programar con Supabase Cron / pg_cron:
   - `maintenance` cada hora (limpieza + `svc_run_fraud_checks`),
   - `admob-import` una vez por día,
   - `dlocal-payouts` una vez por día (solo actúa del 21 al 26),
   - `push-dispatch` cada minuto (o configurar `push.dispatch_url` si hay `pg_net`).
6. Dar roles de administración desde SQL: `insert into private.admin_roles (user_id, role) values ('<uuid>', 'FINANCE');`

### AdMob
1. Crear la app Android e iOS en AdMob y los bloques de anuncios (nativo, intersticial, bonificado).
2. Reemplazar los IDs de prueba de Google en `app/app.json` (plugin `react-native-google-mobile-ads`) y
   en las variables `EXPO_PUBLIC_ADMOB_*` de `app/.env`.
3. En el bloque bonificado, activar la **verificación del lado del servidor** con la URL
   `https://<proyecto>.supabase.co/functions/v1/admob-ssv`.
4. Publicar `app-ads.txt` en el dominio de la web (lo sirve `web/` usando `ADMOB_PUBLISHER_ID`).
5. Para `admob-import`, crear credenciales OAuth con acceso a la AdMob API y obtener un refresh token.

### dLocal
Configurar la cuenta de Payouts, cargar las credenciales como secretos y apuntar las notificaciones a
`https://<proyecto>.supabase.co/functions/v1/payout-webhook?provider=dlocal`.

### App
`cd app && eas build --profile production --platform all` y `eas submit`. Completar `extra.eas.projectId`
en `app.json` (lo agrega `eas init`).

### Web
Desplegar `web/` en cualquier host de Node.js (por ejemplo Vercel) con las variables de
`web/.env.example`. Luego, en **Google Search Console**: verificar el dominio (variable
`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`) y enviar `https://<dominio>/sitemap.xml`.
