-- F4.4 — el rol `viewer`: mira y no toca.
--
-- Pendiente declarado de la §4.3 ("una línea en la matriz"). Sirve para DOS
-- cosas a la vez, y por eso se hace ahora:
--   1. Un miembro real que solo consulta (un socio, un contable, el cliente de
--      una agencia que quiere ver el trabajo sin poder romperlo).
--   2. El rol EFECTIVO con el que un admin de plataforma entra a un tenant
--      cuando no hay concesión de soporte viva. Así la suplantación en modo
--      lectura no necesita un rol sintético: reusa los ~121 `requirePermission`
--      que ya están puestos.
--
-- VA SOLA, sin nada que USE el valor nuevo. Postgres no permite emplear un
-- valor de enum en la misma transacción en que se crea, así que cualquier
-- migración que inserte o compare contra 'viewer' tiene que ser posterior.
--
-- Se AÑADE AL FINAL: el enum se declaró ordenado de más a menos capaz
-- ('owner','admin','operator'), y `viewer` es el menos capaz de todos.

alter type org_member_role add value if not exists 'viewer';
