"""
Lanzador del job de indices.

Existe por una limitacion del az CLI: no acepta valores que empiecen con
guion en --args, asi que "python -m app.jobs.indices" es imposible de
configurar desde la linea de comandos (Azure/azure-cli#27011). Con este
archivo el job arranca como "python run_indices.py", sin ningun guion.

No agregar logica aca: la logica vive en app/jobs/indices.py.
"""
from app.jobs.indices import main

if __name__ == "__main__":
    raise SystemExit(main())
