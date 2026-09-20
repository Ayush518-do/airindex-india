import random
from datetime import datetime, timedelta
from app.database import SessionLocal, engine
from app.models import Base, Airport, Airline, Route, Flight, FareObservation
from app.database import init_db

AIRPORTS = [
    ("DEL", "Delhi", "Delhi", "North", 28.7041, 77.1025),
    ("BOM", "Mumbai", "Mumbai", "West", 19.0886, 72.8697),
    ("BLR", "Bengaluru", "Bengaluru", "South", 13.1939, 77.7068),
    ("HYD", "Hyderabad", "Hyderabad", "South", 17.3850, 78.4867),
    ("MAA", "Chennai", "Chennai", "South", 13.1939, 80.1858),
    ("GOI", "Goa", "Goa", "West", 15.3800, 73.8355),
    ("COK", "Kochi", "Kochi", "South", 10.1591, 76.2191),
    ("CCU", "Kolkata", "Kolkata", "East", 22.6542, 88.4467),
    ("PNQ", "Pune", "Pune", "West", 18.5793, 73.9197),
    ("AMD", "Ahmedabad", "Ahmedabad", "West", 23.0225, 72.5714),
]

AIRLINES = [
    ("AI", "Air India"),
    ("6E", "IndiGo"),
    ("G8", "Go First"),
    ("SG", "SpiceJet"),
    ("AK", "AirAsia"),
    ("9W", "Vistara"),
]

def seed_reference_data():
    init_db()
    db = SessionLocal()
    try:
        if db.query(Airport).count() == 0:
            for iata, name, city, region, lat, lon in AIRPORTS:
                airport = Airport(
                    iata_code=iata, name=name, city=city, state=city,
                    region=region, latitude=lat, longitude=lon, is_active=True
                )
                db.add(airport)
            db.commit()
            print(f"Seeded {len(AIRPORTS)} airports")

        if db.query(Airline).count() == 0:
            for iata, name in AIRLINES:
                airline = Airline(iata_code=iata, name=name, is_active=True)
                db.add(airline)
            db.commit()
            print(f"Seeded {len(AIRLINES)} airlines")

        if db.query(Route).count() == 0:
            airports = db.query(Airport).all()
            count = 0
            for i, origin in enumerate(airports):
                for dest in airports[i+1:i+3]:
                    dist = ((origin.latitude - dest.latitude)**2 + (origin.longitude - dest.longitude)**2)**0.5 * 111
                    route = Route(
                        origin_airport_id=origin.id,
                        destination_airport_id=dest.id,
                        distance_km=dist,
                        region=origin.region,
                        importance_score=random.uniform(0.5, 1.0),
                        is_active=True
                    )
                    db.add(route)
                    count += 1
            db.commit()
            print(f"Seeded {count} routes")
    finally:
        db.close()

def generate_synthetic_observations():
    db = SessionLocal()
    try:
        if db.query(FareObservation).count() > 100:
            print("Synthetic data already exists, skipping")
            return

        routes = db.query(Route).all()
        airlines = db.query(Airline).all()
        base_date = datetime.now().date()
        obs_count = 0

        for route in routes[:10]:
            for days_ahead in [7, 14, 30, 60, 90]:
                for airline in airlines:
                    for _ in range(2):
                        travel_date = base_date + timedelta(days=days_ahead)
                        base = 3000 + route.distance_km * 2
                        variance = base * 0.15 * (1 + random.random())
                        fare = base + variance - (90 - days_ahead) * 10
                        fare = max(fare, base * 0.5)

                        obs = FareObservation(
                            route_id=route.id,
                            airline_id=airline.id,
                            flight_id=None,
                            source="SYNTHETIC",
                            source_type="DEMO",
                            travel_date=str(travel_date),
                            observation_timestamp=datetime.now(),
                            days_to_departure=days_ahead,
                            fare_class="ECONOMY_STANDARD",
                            base_fare=fare * 0.85,
                            taxes=fare * 0.12,
                            fees=fare * 0.03,
                            total_fare=fare,
                            currency="INR",
                            baggage_kg=20,
                            refundable=random.choice([True, False]),
                            stops=random.choice([0, 1]),
                            duration_minutes=int(route.distance_km / 800 * 60 + random.randint(-30, 30)),
                            is_valid=True,
                            validation_status="VALID",
                            anomaly_status="NORMAL",
                            data_type="SYNTHETIC"
                        )
                        db.add(obs)
                        obs_count += 1

        db.commit()
        print(f"Generated {obs_count} synthetic observations")
    finally:
        db.close()

if __name__ == "__main__":
    seed_reference_data()
    generate_synthetic_observations()
