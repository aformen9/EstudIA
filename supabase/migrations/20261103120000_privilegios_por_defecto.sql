-- Supabase otorga por defecto todos los privilegios a anon y authenticated sobre lo nuevo en
-- public. Acá nada se expone sin un GRANT explícito (ver la migración de permisos).
--
-- El EXECUTE de PUBLIC sobre funciones es un default global de Postgres y no se puede quitar con
-- `in schema`: hacerlo sin `in schema` también afectaría a las extensiones. Por eso cada función
-- se revoca explícitamente, y un test pgTAP falla si alguna queda abierta.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
