"""One-off: insert a fake high-priced day so DEL-BOM looks like a real discount
today, for testing the notifier's email send. Run cleanup_test_alert.py after
to remove it."""
from pipeline.db import session

TEST_WINDOW = "TEST_SEED"

with session() as conn:
    conn.execute(
        """INSERT OR REPLACE INTO route_daily
           (date, route, window, avg_fare, median_fare, min_fare, n)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        ("2026-09-10", "DEL-BOM", TEST_WINDOW, 15000.0, 15000.0, 15000.0, 1),
    )
    print("Seeded a fake high-fare day (2026-09-10, DEL-BOM, avg_fare=15000) for testing.")
