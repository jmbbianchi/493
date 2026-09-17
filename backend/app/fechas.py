"""Fechas de negocio en Buenos Aires; auditoría y protocolos conservan UTC."""
from datetime import datetime
from zoneinfo import ZoneInfo

BUENOS_AIRES = ZoneInfo('America/Argentina/Buenos_Aires')

def hoy_argentina():
    return datetime.now(BUENOS_AIRES).date()
