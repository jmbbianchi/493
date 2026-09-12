"""Reglas del proyecto, independientes del computo y del almacenamiento."""
from collections import deque
from datetime import timedelta


def validar_y_programar(tareas, rubros):
    """Valida el grafo completo y desplaza hojas en orden topologico.

    Las fechas son inclusivas: fin-inicio con desfase cero empieza al dia
    siguiente. Nunca adelantamos una fecha elegida por el usuario.
    """
    ids = {t["id"]: t for t in tareas}
    rubros_ids = {r["id"] for r in rubros}
    for t in tareas:
        if t["rubro_id"] not in rubros_ids:
            raise ValueError("El rubro no pertenece a esta obra.")
        padre = t.get("padre_id")
        vistos = {t["id"]}
        while padre:
            if padre not in ids:
                raise ValueError("La tarea superior no pertenece a esta obra.")
            if padre in vistos:
                raise ValueError("La jerarquía de tareas contiene un ciclo.")
            vistos.add(padre)
            p = ids[padre]
            if p["tipo"] != "grupo" or p["rubro_id"] != t["rubro_id"]:
                raise ValueError("La tarea superior debe ser un grupo del mismo rubro.")
            padre = p.get("padre_id")
        inicio, fin = t.get("fecha_inicio"), t.get("fecha_fin")
        if bool(inicio) != bool(fin) or (inicio and fin < inicio):
            raise ValueError("Completá ambas fechas; el fin no puede ser anterior al inicio.")
        if t["tipo"] == "grupo" and (inicio or t.get("dependencias")):
            raise ValueError("Las fechas de un grupo surgen de sus subtareas; vinculá las dependencias entre tareas.")
        if t["tipo"] == "hito" and inicio != fin:
            raise ValueError("Un hito tiene la misma fecha de inicio y fin.")

    sucesoras = {tid: [] for tid in ids}
    entradas = {tid: 0 for tid in ids}
    for t in tareas:
        vistas = set()
        for d in t.get("dependencias", []):
            previo = d["depende_de_id"]
            if previo not in ids:
                raise ValueError("La predecesora no pertenece a esta obra.")
            if previo == t["id"] or previo in vistas:
                raise ValueError("No se puede repetir una predecesora ni depender de sí misma.")
            if ids[previo]["tipo"] == "grupo":
                raise ValueError("Elegí una tarea o un hito como predecesora, no un grupo.")
            vistas.add(previo)
            sucesoras[previo].append(t["id"])
            entradas[t["id"]] += 1

    cola = deque(tid for tid, n in entradas.items() if n == 0)
    orden = []
    while cola:
        tid = cola.popleft()
        orden.append(tid)
        for siguiente in sucesoras[tid]:
            entradas[siguiente] -= 1
            if entradas[siguiente] == 0:
                cola.append(siguiente)
    if len(orden) != len(ids):
        raise ValueError("Las dependencias contienen un ciclo. Revisá las predecesoras.")

    cambios = []
    for tid in orden:
        t = ids[tid]
        if not t.get("fecha_inicio"):
            continue
        limites = [ids[d["depende_de_id"]]["fecha_fin"] + timedelta(days=1 + d["dias_desfase"])
                   for d in t.get("dependencias", [])
                   if ids[d["depende_de_id"]].get("fecha_fin")]
        minimo = max(limites, default=t["fecha_inicio"])
        if minimo > t["fecha_inicio"]:
            salto = minimo - t["fecha_inicio"]
            t["fecha_inicio"] += salto
            t["fecha_fin"] += salto
            cambios.append(tid)
    return cambios


def resumir(tareas, rubros):
    """Cada hoja cuenta una vez, aunque tenga varios niveles de grupos."""
    hijos = {}
    for t in tareas:
        hijos.setdefault(t.get("padre_id"), []).append(t)
    # Resolver de abajo hacia arriba evita limitar la profundidad con la pila.
    pendientes = list(hijos.get(None, []))
    recorrido = []
    while pendientes:
        t = pendientes.pop()
        recorrido.append(t)
        pendientes.extend(hijos.get(t["id"], []))
    hojas_por_id = {}
    for t in reversed(recorrido):
        hojas = ([t] if t["tipo"] != "grupo" else
                 [h for hijo in hijos.get(t["id"], []) for h in hojas_por_id[hijo["id"]]])
        hojas_por_id[t["id"]] = hojas
        if t["tipo"] == "grupo":
            t.update(_resumen(hojas))
        t["duracion"] = ((t["fecha_fin"] - t["fecha_inicio"]).days + 1
                         if t.get("fecha_inicio") and t.get("fecha_fin") else None)
        if t["tipo"] == "hito" and t["duracion"] is not None:
            t["duracion"] = 0
    for r in rubros:
        r.update(_resumen([t for t in tareas if t["rubro_id"] == r["id"] and t["tipo"] != "grupo"]))
    return _resumen([t for t in tareas if t["tipo"] != "grupo"])


def _resumen(hojas):
    inicios = [t["fecha_inicio"] for t in hojas if t.get("fecha_inicio")]
    finales = [t["fecha_fin"] for t in hojas if t.get("fecha_fin")]
    return {
        "fecha_inicio": min(inicios) if inicios else None,
        "fecha_fin": max(finales) if finales else None,
        "avance_pct": (sum(float(t.get("avance_pct") or 0) for t in hojas) / len(hojas)) if hojas else None,
        "tiene_avance": any(t.get("tiene_avance") for t in hojas),
        "cantidad_tareas": len(hojas),
        "sin_fecha": sum(not t.get("fecha_inicio") for t in hojas),
        "completadas": sum(float(t.get("avance_pct") or 0) == 100 for t in hojas),
    }
