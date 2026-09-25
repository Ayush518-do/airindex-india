from pipeline.db import session

with session() as conn:
    rows = conn.execute("SELECT * FROM saved_routes").fetchall()
    print(f"{len(rows)} saved route(s)")
    for r in rows:
        print(dict(r))
