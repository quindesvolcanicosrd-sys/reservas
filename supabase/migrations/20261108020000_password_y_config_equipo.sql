-- Contraseña propia (alternativa a Google; reemplazará al PIN). Formato:
-- pbkdf2$<iteraciones>$<sal base64>$<hash base64> (PBKDF2-SHA256).
alter table equipo add column if not exists password_hash text;
