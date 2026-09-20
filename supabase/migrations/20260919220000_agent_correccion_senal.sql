-- SP-0 — SALVAR LA SEÑAL DE CORRECCIÓN DEL AGENTE.
--
-- `approveAndSend` escribía el texto editado por el humano ENCIMA del borrador
-- (`.update({ text })`), así que el par «lo que dijo la IA → lo que se mandó de
-- verdad» se destruía en cada envío. Es la señal de entrenamiento más valiosa
-- del producto y no quedaba rastro de ella en ningún sitio.
--
-- `discardDraft` dejaba `status='discarded'` sin motivo. La fila sobrevivía
-- (`getAgentChatThread` la filtra al pintar) pero nadie la leía ni podía
-- interpretarla: "esto estuvo mal" sin decir por qué no sirve para corregir.
--
-- Columnas ADITIVAS y nullable: lo ya guardado sigue siendo válido, y un
-- mensaje sin `original_text` significa exactamente "nadie lo corrigió".

alter table agent_messages
    add column if not exists original_text text,
    add column if not exists discard_reason text,
    add column if not exists discard_note text;

comment on column agent_messages.original_text is
    'El borrador TAL CUAL salió del modelo, cuando un humano lo editó antes de enviar. NULL = no se corrigió. Nunca se pisa: en una segunda edición sigue siendo el primero, o el par quedaría falseado.';
comment on column agent_messages.discard_reason is
    'Por qué se tiró el borrador. Lista cerrada, espejo de DISCARD_REASONS en src/lib/agent/draftCorrection.ts.';
comment on column agent_messages.discard_note is
    'Matiz libre del descarte. El motivo se agrupa y se cuenta; la nota explica.';

-- Espejo en la base de la lista de `draftCorrection.ts`. La aplicación ya falla
-- cerrado con `isDiscardReason`, pero esta tabla también la escriben scripts y
-- backfills, y un motivo inventado rompería el agrupado sin que nadie se entere.
do $$ begin
    alter table agent_messages add constraint agent_messages_discard_reason_check
        check (discard_reason is null or discard_reason in (
            'off_persona','wrong_facts','too_salesy','unsafe','bad_language','other'
        ));
exception when duplicate_object then null; end $$;

-- La cola de revisión de SP-6 pregunta siempre lo mismo: «dame las
-- correcciones y los descartes de esta organización, los más nuevos primero».
-- Índice PARCIAL porque los casos corregidos son una minoría de
-- `agent_messages` y un índice completo costaría escritura en cada turno del
-- agente para responder a una pantalla que se abre de vez en cuando.
create index if not exists idx_agent_messages_correcciones
    on agent_messages(organization_id, created_at desc)
    where original_text is not null or discard_reason is not null;
