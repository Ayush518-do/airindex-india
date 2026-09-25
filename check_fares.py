from pipeline.db import session

with session() as conn:
    rows = conn.execute(
        "SELECT date, avg_fare FROM route_daily WHERE route = 'DEL-BOM' ORDER BY date"
    ).fetchall()
    print(f"{len(rows)} day(s) of DEL-BOM fare history")
    for r in rows:
        print(dict(r))
