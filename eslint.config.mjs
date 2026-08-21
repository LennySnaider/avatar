import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
      "@next/next/no-img-element": "off",
      "react-hooks/rules-of-hooks": "off"
    },
  },
  // F4.2.a — candado multitenant (WARN durante la migración; pasa a error en
  // F4.2.g): los componentes/páginas NO acceden a Supabase directo — todo
  // dato tenant pasa por server actions con getOrgContext() + orgTable.
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: [
      "src/app/api/webhooks/**",
      "src/app/api/cron/**",
      // Infra de auth (tabla users, no datos tenant)
      "src/app/api/auth/**",
    ],
    rules: {
      "no-restricted-imports": [
        "warn",
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
  // al alcance de cualquier fichero (43 usos cuando se midió). También en WARN
  // mientras dura la migración — sube a error en la Tarea 6, no antes, para no
  // dejar la rama roja a media faena.
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
    files: ["src/**/*.{ts,tsx}"],
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
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "warn",
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
];

export default eslintConfig;
