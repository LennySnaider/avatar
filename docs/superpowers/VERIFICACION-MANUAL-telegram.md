# Verificación manual del canal de Telegram

Tres cosas que ningún agente pudo hacer y que quedan para ti. La tercera es la que demuestra el objetivo entero del plan: que la comisión sea cobrable de verdad.

Todo lo demás está verificado: 152 pruebas en verde incluso con el entorno vaciado, compilador y analizador limpios, aislamiento entre organizaciones comprobado, y la **cuota mensual ya demostrada de punta a punta contra la base real**.

---

## Antes de empezar

El código está en la rama `feat/telegram-comision-cobrable`, **sin fusionar y sin subir**. Si prefieres probar antes de integrar, quédate en ella.

Necesitas: un bot de BotFather, una segunda cuenta de Telegram distinta de la tuya, y unas pocas Stars.

---

## 1. Un túnel público, porque Telegram necesita alcanzarte

Telegram exige una dirección segura y pública para entregar los eventos. En local no la tienes.

```bash
cloudflared tunnel --url http://localhost:3030
```

Copia la dirección que imprime, ponla en `NEXT_PUBLIC_APP_URL` y reinicia el servidor de desarrollo. Sin este paso, conectar el bot registra un webhook que apunta a tu portátil y Telegram lo rechaza.

Cuando el túnel muera, el webhook queda apuntando a una dirección muerta. La pantalla del canal te avisará de eso: compara la dirección registrada con la que debería ser.

---

## 2. Instalar el módulo y conectar el bot

1. Crea un bot con BotFather y guarda su token.
2. Entra en **Cuenta → Módulos** e instala Telegram. Sin eso, las pantallas del canal no aparecen en el menú.
3. Ve a **Avatar Forge → Telegram**, elige un avatar y pega el token.

Comprueba desde fuera que el webhook quedó bien:

```bash
curl -s "https://api.telegram.org/bot<TU_TOKEN>/getWebhookInfo"
```

Debe mostrar la dirección de tu túnel, sin `last_error_message`, y con `message` y `purchased_paid_media` entre los tipos permitidos.

**Esto también prueba el cliente del bot contra la API real**, que era uno de los pendientes.

---

## 3. Crear una conversación

Escríbele al bot **desde la otra cuenta**, no desde la tuya.

```sql
select platform, external_chat_id, fan_display_name
from agent_chats where platform = 'telegram';
```

Debe aparecer una fila. El agente **no** va a responder: eso es del plan siguiente. El mensaje solo sirve para que exista una conversación a la que ofrecer contenido.

---

## 4. La prueba que importa: vender una Star

1. En la pestaña de galería, añade un contenido desde una generación existente y ponle precio de **1 Star**.
2. En la pestaña de conversaciones, envíaselo a la conversación que creaste.
3. Desde la otra cuenta, **cómpralo**.

No existe entorno de pruebas para contenido de pago en Telegram. Esto ocurre con dinero real, por eso una sola estrella.

---

## 5. Comprobar que el dinero llegó al libro mayor

```sql
select s.status, s.stars, s.sold_by, s.commission_pct, s.commission_tokens,
       s.commission_ledger_id, l.sku, l.tokens, l.metadata
from telegram_stars_sales s
left join token_ledger l on l.id = s.commission_ledger_id
order by s.offered_at desc limit 1;
```

Lo que debe salir:

| Campo | Valor esperado |
|---|---|
| `status` | `purchased` |
| `sold_by` | `manual` |
| `commission_pct` | `7.00` |
| `commission_tokens` | `1` |
| `commission_ledger_id` | no nulo |
| `sku` | `commission:telegram` |

Sobre el token único: la conversión redondea hacia arriba, así que una estrella al siete por ciento sí produce un asiento real y no cero.

**Si esta consulta devuelve eso, la comisión es cobrable y el plan cumplió su objetivo.**

Será la comisión manual del siete por ciento, no la del veinte. El veinte exige que el agente responda en Telegram, y eso es el plan siguiente.

**Si pruebas con una organización exenta de cobro** (`organizations.billing_exempt = true` — es el caso de la organización del dueño de la plataforma, que vende por su propio Telegram como cualquier cliente): la fila NO va a mostrar la tabla de arriba. Vas a ver `commission_tokens = 0` y `commission_ledger_id` nulo (el `left join` con `token_ledger` no encuentra nada, porque una organización exenta no genera NINGÚN asiento — ver la migración `billing_exemption`), pero `commission_pct` sigue en `7.00`: es el % REAL que se habría cobrado, no cero, para que quede constancia de cuánto se dejó de cobrar. Eso es lo esperado, no un fallo.

Para distinguirlo de un fallo real, añade `commission_exempt` y `commission_settled_at` a la consulta:

```sql
select s.status, s.commission_pct, s.commission_tokens, s.commission_ledger_id,
       s.commission_exempt, s.commission_settled_at
from telegram_stars_sales s
order by s.offered_at desc limit 1;
```

| Caso | `commission_ledger_id` | `commission_exempt` | `commission_settled_at` |
|---|---|---|---|
| Cobrada normal | no nulo | `false` | sellado |
| **Exenta (esperado en la org del dueño)** | nulo | **`true`** | **sellado** |
| Fallo real (sin resolver) | nulo | `false` | **nulo** |

La columna que separa "exenta" de "fallo" es `commission_settled_at`: en una exención SÍ se sella, porque la comisión quedó resuelta (lo resuelto es que no había nada que cobrar); en un fallo real queda nula, y esa es la fila que la reconciliación de la última sección ("Lo que ya sabemos que falta") debe seguir señalando — la consulta de ahí (`status = 'purchased' and commission_settled_at is null`) ya excluye a las exentas precisamente porque éstas sí sellan la fecha.

---

## 6. Comprobar que no se cobra dos veces

Telegram reintenta los eventos. Espera un poco y cuenta:

```sql
select count(*) from token_ledger where sku = 'commission:telegram';
```

Debe seguir en uno. Hay tres barreras contra el doble cobro y esta es la comprobación de que funcionan.

---

## 7. Devolver la Star y dejar limpio

```bash
curl -s "https://api.telegram.org/bot<TU_TOKEN>/refundStarPayment" \
  -d "user_id=<ID_DEL_COMPRADOR>" -d "telegram_payment_charge_id=<CHARGE_ID>"
```

Y comprueba que el monedero cuadra. **Usa SQL directo, nunca el cliente REST**: devuelve como mucho mil filas y trunca en silencio, y el libro mayor tiene más de dos mil.

```sql
select (select coalesce(sum(tokens),0) from token_ledger where organization_id = '<TU_ORG>') as ledger,
       (select included_balance + purchased_balance from org_wallets where organization_id = '<TU_ORG>') as wallet;
```

Los dos números deben coincidir.

---

## 8. Si el túnel muere

El webhook queda apuntando a una dirección muerta y el bot deja de recibir, sin ningún error. La pantalla te lo avisa. Para arreglarlo, reconecta el bot con `NEXT_PUBLIC_APP_URL` apuntando a producción, o desconéctalo.

---

## 9. El agente contesta y vende

Las secciones 1-8 prueban la venta **manual**: tú eliges el ítem y lo envías desde la galería. Esta prueba la venta **por IA**: el agente adjunta él solo una oferta a su propio borrador y Autopilot lo despacha sin que lo toques — el escenario que sube la comisión del 7% al 20%.

Necesitas lo mismo que en las secciones anteriores (túnel activo, bot conectado, segunda cuenta) más al menos un ítem de pago cargado en la galería.

1. **AI Agent → "Agent enabled" OFF.** Este interruptor sólo gobierna la bandeja de Fanvue; la propia pantalla de Telegram lo avisa ("This switch is independent from 'Agent enabled' on the AI Agent page"). Apagarlo aquí y comprobar que aun así contesta en Telegram demuestra que son dos interruptores de verdad, no uno disfrazado de dos.
2. **Telegram → bot:** "AI replies" **ON**, "New chats start in" **Auto**, "Let the AI offer paid content" **ON**.
3. **Autopilot** (pantalla del avatar) **ON**, con "Allow paid offers on autopilot" **ON** y "Max Stars the AI may offer" en **100**.
4. Desde la segunda cuenta, manda `/start` y espera el saludo — hasta **4 minutos**: el cron de Autopilot (`agent-autopilot-flush`) corre cada minuto y el retraso humanizado que añade por defecto llega hasta 180 segundos, así que 3+1 minutos es el peor caso, no un cuelgue.
5. Manda tres mensajes cálidos seguidos ("me encantas", "quiero ver más de ti"…) y espera la respuesta. Debe llegar el texto y, detrás, una foto de pago: la oferta que el propio agente decidió adjuntar.
6. Comprueba en SQL que quedó anotada como generada por la IA, no por ti:

    ```sql
    select sold_by, source, status from telegram_stars_sales order by offered_at desc limit 1;
    ```

    Debe salir `ai` / `agent` / `offered`. Si sale `manual` o `inbox`, la oferta salió por el camino de la venta manual — revisa el paso 2 antes de seguir.
7. Cómprala desde la segunda cuenta. La fila pasa a `status = purchased` y, si la organización no está exenta de cobro, se asienta una comisión `commission:telegram` **al 20%** — no al 7% de la venta manual (sección 5). Ese salto de porcentaje es la prueba de que el sistema sabe distinguir quién vendió.

---

## Lo que ya sabemos que falta

Un **barrido de reconciliación** sobre la tabla de ventas. Tres situaciones dejan una venta descuadrada sin que nada avise, y las tres se detectan así:

```sql
-- ofertas que nunca llegaron a enviarse
select * from telegram_stars_sales
where status = 'offered' and offered_at < now() - interval '24 hours';

-- ventas cobradas que no llegaron a comisionarse
select * from telegram_stars_sales
where status = 'purchased' and commission_settled_at is null;
```

Es el primer punto del plan siguiente. Mientras tanto, esas dos consultas son la red.
