-- El nombre visible del módulo `strategist` pasa de "Estratega" a
-- "Social Media Manager" (pedido del usuario 19-sep-2026: "Estratega" no se
-- entendía). El slug NO cambia: es la clave de org_modules, permisos,
-- TENANT_TABLES y del código; renombrarlo sería una migración de datos para
-- un cambio de copy.
update module_catalog
set name = 'Social Media Manager'
where slug = 'strategist';
