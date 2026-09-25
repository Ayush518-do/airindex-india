"""Removes the fake row seed_test_alert.py inserted, and resets last_notified_at
on the saved routes so you can re-test the notifier later without waiting out
the 24h cooldown."""
from pipeline.db import session

TEST_WINDOW = "TEST_SEED"

with session() as conn:
    conn.execute("DELETE FROM route_daily WHERE window = ?", (TEST_WINDOW,))
    conn.execute("UPDATE saved_routes SET last_notified_at = NULL")
    print("Removed the seeded test row and reset notification cooldowns.")
