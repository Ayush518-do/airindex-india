"""
The one place airport codes become human-readable.

"DEL-BOM" means nothing to a traveller. Every surface — dropdowns, charts,
tables, alert emails — should say "Delhi (DEL) → Mumbai (BOM)", and it should
say it the same way everywhere, so the mapping lives here and is served to the
frontend at GET /meta/cities rather than duplicated in TypeScript.
"""
from __future__ import annotations

CITIES: dict[str, dict[str, str]] = {
    "DEL": {"city": "Delhi", "state": "Delhi", "airport": "Indira Gandhi International"},
    "BOM": {"city": "Mumbai", "state": "Maharashtra", "airport": "Chhatrapati Shivaji Maharaj International"},
    "BLR": {"city": "Bengaluru", "state": "Karnataka", "airport": "Kempegowda International"},
    "MAA": {"city": "Chennai", "state": "Tamil Nadu", "airport": "Chennai International"},
    "CCU": {"city": "Kolkata", "state": "West Bengal", "airport": "Netaji Subhas Chandra Bose International"},
    "HYD": {"city": "Hyderabad", "state": "Telangana", "airport": "Rajiv Gandhi International"},
    "AMD": {"city": "Ahmedabad", "state": "Gujarat", "airport": "Sardar Vallabhbhai Patel International"},
    "PNQ": {"city": "Pune", "state": "Maharashtra", "airport": "Pune International"},
    "GOI": {"city": "Goa", "state": "Goa", "airport": "Dabolim"},
    "GOX": {"city": "Goa (Mopa)", "state": "Goa", "airport": "Manohar International"},
    "COK": {"city": "Kochi", "state": "Kerala", "airport": "Cochin International"},
    "JAI": {"city": "Jaipur", "state": "Rajasthan", "airport": "Jaipur International"},
    "LKO": {"city": "Lucknow", "state": "Uttar Pradesh", "airport": "Chaudhary Charan Singh International"},
    "PAT": {"city": "Patna", "state": "Bihar", "airport": "Jay Prakash Narayan International"},
    "BBI": {"city": "Bhubaneswar", "state": "Odisha", "airport": "Biju Patnaik International"},
    "GAU": {"city": "Guwahati", "state": "Assam", "airport": "Lokpriya Gopinath Bordoloi International"},
    "IXC": {"city": "Chandigarh", "state": "Chandigarh", "airport": "Chandigarh International"},
    "TRV": {"city": "Thiruvananthapuram", "state": "Kerala", "airport": "Trivandrum International"},
    "VNS": {"city": "Varanasi", "state": "Uttar Pradesh", "airport": "Lal Bahadur Shastri International"},
    "SXR": {"city": "Srinagar", "state": "Jammu & Kashmir", "airport": "Sheikh ul-Alam International"},
    "IXB": {"city": "Bagdogra", "state": "West Bengal", "airport": "Bagdogra"},
    "NAG": {"city": "Nagpur", "state": "Maharashtra", "airport": "Dr. Babasaheb Ambedkar International"},
    "IDR": {"city": "Indore", "state": "Madhya Pradesh", "airport": "Devi Ahilyabai Holkar"},
    "RPR": {"city": "Raipur", "state": "Chhattisgarh", "airport": "Swami Vivekananda"},
}

# Plain-English gloss for the advance-purchase windows. "T+15" and "window"
# mean nothing to a traveller; this is what the UI shows instead.
WINDOW_LABELS: dict[str, str] = {
    "0-3": "Booked 0–3 days before travel (last minute)",
    "4-7": "Booked 4–7 days before travel",
    "8-14": "Booked 1–2 weeks before travel",
    "15-30": "Booked 2–4 weeks before travel",
    "31-60": "Booked 1–2 months before travel (early bird)",
}

WINDOW_SHORT: dict[str, str] = {
    "0-3": "0–3 days ahead",
    "4-7": "4–7 days ahead",
    "8-14": "1–2 weeks ahead",
    "15-30": "2–4 weeks ahead",
    "31-60": "1–2 months ahead",
}


def city_name(code: str) -> str:
    """'DEL' -> 'Delhi'. Unknown codes fall back to the code itself."""
    return CITIES.get(code.upper(), {}).get("city", code.upper())


def city_label(code: str) -> str:
    """'DEL' -> 'Delhi (DEL)'."""
    code = code.upper()
    name = CITIES.get(code, {}).get("city")
    return f"{name} ({code})" if name else code


def route_label(route: str) -> str:
    """'DEL-BOM' -> 'Delhi (DEL) → Mumbai (BOM)'."""
    parts = route.upper().split("-")
    if len(parts) != 2:
        return route
    return f"{city_label(parts[0])} → {city_label(parts[1])}"


def route_short_label(route: str) -> str:
    """'DEL-BOM' -> 'Delhi → Mumbai'. For axis ticks, where codes do not fit."""
    parts = route.upper().split("-")
    if len(parts) != 2:
        return route
    return f"{city_name(parts[0])} → {city_name(parts[1])}"


def as_list() -> list[dict]:
    return [
        {"code": code, "city": v["city"], "state": v.get("state"),
         "airport": v.get("airport"), "label": f"{v['city']} ({code})"}
        for code, v in sorted(CITIES.items(), key=lambda kv: kv[1]["city"])
    ]
