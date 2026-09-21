-- Ocultar el módulo "Limpieza de marcas de IA" del catálogo hasta que su código
-- esté en main.
--
-- POR QUÉ: la migración 20260920030000_ai_mark_cleaner_module de la rama
-- `feat/ai-mark-cleaner` se aplicó a la base de producción el 20-sep, pero la
-- rama no se ha mergeado. Su fila en `module_catalog` nació con
-- `is_public = true`, así que la pantalla de Módulos de `main` la pintaba —como
-- "Próximamente"— con el botón Instalar ACTIVO. Instalar no hacía nada con el
-- código de main, pero el día que la rama entre, toda org que lo hubiera
-- instalado empezaría a pagar 10 tokens por imagen y, una hora después de cada
-- limpieza, perdería el original de forma irreversible (el cron
-- `ai-marks-sweep` lo borra de R2).
--
-- Con `is_public = false`, main deja de pintarlo (`getModuleCatalog` filtra por
-- is_public) y rechaza instalarlo (`setModuleStatus` exige `def.isPublic`).
-- Verificado antes de aplicar: 0 filas en `org_modules` con este slug.
--
-- REVERTIR cuando la rama se mergee y el módulo esté probado: otra migración
-- con `is_public = true`. No se borra la fila: la rama la necesita y su propia
-- migración ya está aplicada (no se volvería a ejecutar).
update module_catalog
   set is_public = false
 where slug = 'ai-mark-cleaner';
