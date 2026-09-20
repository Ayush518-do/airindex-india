#!/usr/bin/env python3
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from app.database import init_db
from app.synthetic_data import seed_reference_data, generate_synthetic_observations

if __name__ == "__main__":
    print("Initializing database...")
    init_db()
    print("Seeding data...")
    seed_reference_data()
    generate_synthetic_observations()
    print("Database setup complete")
