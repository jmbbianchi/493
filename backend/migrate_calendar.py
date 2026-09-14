"""Migración idempotente del calendario. Usa la conexión del despliegue."""
from app import db

SQL = """
IF OBJECT_ID('dbo.cuota_calendario','U') IS NULL
BEGIN
    CREATE TABLE dbo.cuota_calendario (
        cuota_id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.cuota(id),
        fecha date NULL,
        version int NOT NULL DEFAULT 1
    );
END
"""

if __name__ == '__main__':
    db.execute(SQL)
    print('Calendario: esquema actualizado.')
