import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// F4.2 — CUARTO candado (getStoragePublicUrl): plugin local con UN rule id
// nuevo, en vez de reutilizar no-restricted-syntax/no-restricted-imports.
//
// POR QUÉ un id nuevo y no uno de los tres de abajo: en flat config, dos
// bloques con el MISMO id de regla NO se fusionan — gana el último que
// matchea el archivo (verificado con ficheros sonda: un segundo bloque con
// el mismo id "no-restricted-syntax" y un `files` solapado hace que el
// selector del PRIMER bloque deje de dispararse, en silencio). Este candado
// necesita aplicar casi a todo `src/` (todo menos `src/lib/`), que se solapa
// por completo con el `files` de los tres bloques de abajo — no hay forma de
// reusar ninguno de sus tres ids sin pisar alguno en los archivos que
// comparten. Un id propio (`local/no-raw-storage-public-url`) elimina el
// riesgo por construcción.
const localRules = {
    rules: {
        'no-raw-storage-public-url': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        'getStoragePublicUrl() siempre arma una URL de Supabase Storage, sin mirar storage_provider. La media de generations/avatars ya vive en R2 (las copias de Supabase se drenaron) y esa URL da 400.',
                },
                schema: [],
            },
            create(context) {
                return {
                    "ImportDeclaration[source.value='@/lib/storagePaths'] > ImportSpecifier[imported.name='getStoragePublicUrl']"(
                        node,
                    ) {
                        context.report({
                            node,
                            message:
                                'getStoragePublicUrl() no sabe de storage_provider — SIEMPRE arma la URL de Supabase, y la media migrada a R2 ya no tiene copia ahi (400). Usa getRowMediaUrl(row) / getRowThumbnailUrl(row) para filas de generations (o getGenerationMediaUrl(path, provider) si no tienes la fila completa), y getReferenceMediaUrl(path, provider) para el bucket avatars.',
                        })
                    },
                }
            },
        },
    },
}

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
      "@next/next/no-img-element": "off",
      "react-hooks/rules-of-hooks": "off"
    },
  },
  // F4.2.a — candado multitenant (en ERROR desde la Tarea 6): los
  // componentes/páginas NO acceden a Supabase directo — todo dato tenant pasa
  // por server actions con getOrgContext() + orgTable.
  {
    // Todas las extensiones que Next ejecuta, no sólo TypeScript: un
    // `route.js` es una ruta válida y quedaba SIN regla aplicable — punto
    // ciego compartido con el grep de `check:tenant` (allí también se amplió).
    files: ["src/app/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}", "src/components/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    ignores: [
      "src/app/api/webhooks/**",
      "src/app/api/cron/**",
      // Infra de auth (tabla users, no datos tenant)
      "src/app/api/auth/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase",
              message:
                "Acceso a datos tenant solo vía server actions (getOrgContext + orgTable). Excepción permitida: uploadToSignedUrl con URL emitida por el server.",
            },
          ],
        },
      ],
    },
  },
  // F4.2 Tarea 4 — el MISMO candado para `agentSupabase()`. La regla de arriba
  // sólo prohíbe `@/lib/supabase`, así que `@/lib/agent/db` funcionaba de
  // atajo: exporta un cliente service-role SIN scope de organización y estaba
  // al alcance de cualquier fichero (43 usos cuando se midió). En ERROR desde
  // la Tarea 6, ya con la migración terminada.
  //
  // Dos detalles deliberados:
  //  - Va con el id `@typescript-eslint/no-restricted-imports`, NO con el de
  //    ESLint base: en flat config dos bloques que configuran el MISMO id no se
  //    fusionan, el último gana — reusar el id anularía el candado de
  //    `@/lib/supabase` en src/app/**.
  //  - `importNames` acota la prohibición a la FUNCIÓN. Los tipos del módulo
  //    (AgentChatRow, AvatarPersonaRow…) se siguen importando sin ruido: el
  //    agujero era el cliente, no el esquema.
  {
    files: ["src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    ignores: [
      // Mismas exenciones que la regla de `@/lib/supabase`: corren sin sesión.
      "src/app/api/webhooks/**",
      "src/app/api/cron/**",
      "src/app/api/auth/**",
      // Bootstrap del tenant: lee organization_members para PODER construir el
      // ctx que orgTable exige — pasarlo por orgTable sería circular.
      "src/lib/tenant/getOrgContext.ts",
      // La definición, y el núcleo compartido que disparan webhook y cron (sin
      // sesión). Cada uno documenta en su cabecera por qué sigue crudo y por
      // qué org filtra cada consulta.
      "src/lib/agent/db.ts",
      "src/lib/agent/inboxSync.ts",
      "src/lib/agent/draftPipeline.ts",
      "src/lib/agent/autopilot.ts",
      "src/lib/agent/sendMessage.ts",
      "src/lib/agent/indexer.ts",
      // Sólo usa el RPC match_avatar_knowledge; orgTable no pre-scopea RPCs.
      "src/lib/agent/retrieval.ts",
      // F4.2 Tarea 4 (comentarios-ia-social) — maybeSendCommentDm, mismo
      // perfil que el resto de esta lista: lo llama `channelDelivery.ts` sin
      // sesión (webhook/cron), y el `chat` que recibe ya llegó resuelto y
      // acotado por `organization_id` desde `sendAgentMessage`. Está fuera de
      // `src/lib/agent/` (vive junto a `dmEligibility.ts`/`ids.ts`, el resto
      // de comentarios-ia-social) así que no cae en el import RELATIVO
      // `./db` que usa `channelDelivery.ts` para esquivar esta regla sin
      // proponérselo — aquí el import es `@/lib/agent/db` explícito.
      "src/lib/social/comments/privateReply.ts",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/agent/db",
              importNames: ["agentSupabase"],
              message:
                "agentSupabase() es service-role SIN scope de org. Con sesión: getOrgContext() + orgTable/orgInsert/orgUpsert (@/lib/org/orgTable). Sin sesión (webhook/cron): filtra por la org de la fila ya resuelta y documenta el porqué.",
            },
          ],
        },
      ],
    },
  },
  // F4.2 Tarea 6 (ronda 2) — TERCER candado: `orgSupabase()`.
  //
  // Las dos reglas de arriba tapan `@/lib/supabase` y `agentSupabase`, pero
  // `orgSupabase()` —exportado por el propio `@/lib/org/orgTable`— devuelve
  // EXACTAMENTE el mismo cliente service-role sin scope de organización, y no
  // lo restringía nada: conseguir una puerta sin candado era un import legal
  // desde cualquier fichero.
  //
  // Va con el id `no-restricted-syntax`, un TERCER id distinto. Misma trampa de
  // flat config que documenta el bloque anterior: reusar cualquiera de los dos
  // ids de arriba habría anulado ese candado en silencio.
  //
  // Las exenciones son las de siempre (lib/, webhooks, crons) más los ficheros
  // que HOY lo importan con motivo. Las tres primeras sólo lo usan para
  // Supabase Storage o para tablas que NO son tenant; un helper de Storage sin
  // capacidad de tocar tablas las sacaría de esta lista — deuda anotada.
  {
    files: ["src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    ignores: [
      // `src/lib/billing/wallet.ts` es el ÚNICO fichero de `src/lib/` que lo
      // importa, y lo usa para `token_ledger` / `org_wallets`, que no son
      // tablas tenant. Antes esta línea era `src/lib/**` con el comentario
      // "quien define y quien envuelve": falso, y el mismo defecto de exentar
      // por carpeta que ya se corrigió en `src/lib/agent/`. (Quien DEFINE
      // `orgSupabase` es `src/lib/org/orgTable.ts`, que no necesita exención:
      // no se importa a sí mismo, así que la regla nunca puede dispararle.)
      "src/lib/billing/wallet.ts",
      // Cron de cuotas: mismo caso que wallet.ts — la org llega por parámetro
      // (fila de org_modules) y corre sin sesión. (`moduleCharges.ts` NO va
      // aquí: no importa `orgSupabase` ni tiene un solo `.from()`, así que la
      // regla nunca podría dispararle — exentarlo sería una exención muerta,
      // justo lo que prohíbe la cabecera de check-tenant-access.mjs.)
      "src/lib/billing/moduleFees.ts",
      // Lector de la exención de cobro (isBillingExempt): consulta
      // `organizations`, que NO es tabla tenant (no tiene organization_id —
      // es la propia identidad del tenant), filtrando por el id que llega
      // por parámetro. Sin sesión: lo llaman el cron de cuotas y la comisión
      // de venta, igual que moduleFees.ts.
      "src/lib/billing/exemption.ts",
      // Resumen de cobro por módulo (cuota + comisión del mes en curso): misma
      // tabla no tenant que wallet.ts (`token_ledger`), filtrada a mano por
      // organization_id — que aquí llega ya resuelto por parámetro, no por ctx.
      "src/lib/billing/moduleSummary.ts",
      // Entitlement de módulos: hasModuleForOrg/listInstalledSlugsForOrg reciben
      // la org por parámetro (cron/webhooks) y module_catalog es un catálogo
      // global sin organization_id — mismo par que check-tenant-access.mjs.
      "src/lib/modules/entitlements.ts",
      "src/lib/modules/catalog.ts",
      // loadTelegramSettings (variante sin sesión, para el webhook y los
      // crones): filtra por avatar_id, que es UNIQUE en avatar_telegram_settings
      // (migración de la Tarea 1) — no necesita organizationId de entrada para
      // identificar la fila. La otra variante del fichero, con ctx, va por
      // orgTable y no dispara esta regla.
      "src/lib/telegram/settings.ts",
      // F4.2 Tarea 4 — recordStarsSale corre disparado por el webhook, sin
      // sesión. La organizationId no se adivina: llega ya resuelta en el
      // propio StarsSaleEvent (la fila que la transición atómica del webhook
      // acaba de devolver), y cada consulta la usa como filtro explícito.
      "src/lib/telegram/sales.ts",
      // Task 5 — deliverPaidMedia, mismo perfil que sales.ts: sin sesión,
      // recibe el chat ya resuelto y acotado por su llamador
      // (sendPaidMediaFromInbox), y cada acceso usa esa organizationId como
      // filtro o como campo fijado. Ver check-tenant-access.mjs (misma
      // exención, motivo completo allí).
      "src/lib/telegram/paidMedia.ts",
      // Task 6 — telegramUnitActivity, mismo perfil que moduleFees.ts: sin
      // sesión (lo dispara el cron de cuotas), la organizationId llega por
      // parámetro y la única consulta del fichero la filtra con
      // .eq('organization_id', ...). Ver check-tenant-access.mjs (misma
      // exención, motivo completo allí).
      "src/lib/telegram/bots.ts",
      // Task 8 — motor de oferta, mismo perfil que paidMedia.ts: sin sesión
      // (lo dispara el webhook dentro de su `after()`), parte del borrador que
      // nuestro propio pipeline acaba de crear —esa fila RESUELVE la org— y
      // cada consulta posterior la usa como filtro .eq. Cruza el catálogo con
      // `telegram_stars_sales`, que el schema extendido de `@/lib/agent/db` NO
      // declara, así que `agentSupabase()` ni siquiera compila ahí (medido,
      // TS2769). Ver check-tenant-access.mjs (misma exención, motivo completo
      // allí) y la cabecera del propio fichero.
      "src/lib/telegram/offerEngine.ts",
      // Sin sesión: resuelven la org por la fila que ya cargaron.
      "src/app/api/webhooks/**",
      "src/app/api/cron/**",
      // Sólo Storage (bucket `avatars`), no tablas.
      "src/app/api/voice/clone/route.ts",
      "src/server/actions/getAvatars.ts",
      // Sólo `ai_providers`: catálogo global, no es tabla tenant.
      "src/server/actions/getAvatarStudioData.ts",
      // Sólo `pending_generations`: no es tabla tenant.
      "src/services/PendingGenerationService.ts",
      // Inserts que fijan organization_id desde ctx (los mismos que
      // CON_ANCLA_DE_ORG en scripts/check-tenant-access.mjs).
      "src/services/AvatarForgeService.ts",
      "src/services/SocialService.ts",
      "src/services/KieTaskRescueService.ts",
      "src/services/ReconcileGenerationsService.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value='@/lib/org/orgTable'] > ImportSpecifier[imported.name='orgSupabase']",
          message:
            "orgSupabase() es el cliente service-role SIN scope de org. Usa orgTable/orgInsert/orgUpsert, que ya llevan el filtro pegado. Si de verdad necesitas el cliente crudo (Storage, tabla no tenant), añade la ruta a las exenciones de este bloque con el motivo escrito.",
        },
      ],
    },
  },
  // F4.2 — CUARTO candado: `getStoragePublicUrl` fuera de `src/lib/`.
  //
  // Historial (no es teórico): la migración de `generations` a R2 dejó ocho
  // avatares sin cara; 20-ago `AvatarSelector.tsx` (commit 77406c7) y 21-ago
  // `AssignAvatarDialog.tsx` (commit c2536aa) repitieron el MISMO fallo en el
  // grid/diálogo de avatares — construir la URL fija a Supabase sin mirar
  // `storage_provider`. `getStoragePublicUrl` en sí no está mal: es la pieza
  // interna que SÍ sabe de Supabase; el error es llamarla directo fuera de
  // `src/lib/`, saltándose los helpers que resuelven r2 vs supabase por fila
  // (`getRowMediaUrl`/`getRowThumbnailUrl`/`getGenerationMediaUrl` para
  // generations, `getReferenceMediaUrl` para avatars).
  //
  // Va por IMPORT, no por texto de la llamada: el fallo de AssignAvatarDialog
  // se escapó de un grep de `getStoragePublicUrl('avatars'` porque la llamada
  // estaba partida en varias líneas. Un selector AST sobre el ImportSpecifier
  // no depende de cómo se formatee la llamada.
  {
    files: ["src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    ignores: [
      // El propio módulo: es quien define la función y quien la llama para
      // construir el fallback de getGenerationMediaUrl/getReferenceMediaUrl
      // cuando no hay provider r2. Cualquier otro fichero de src/lib/ que en
      // el futuro necesite el crudo también queda exento a propósito — el
      // límite que pide este candado es la carpeta, no el archivo.
      "src/lib/**",
    ],
    plugins: { local: localRules },
    rules: {
      "local/no-raw-storage-public-url": "error",
    },
  },
];

export default eslintConfig;
