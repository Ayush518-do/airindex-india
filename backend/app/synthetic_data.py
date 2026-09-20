import random
import math
from datetime import datetime, timedelta
from app.database import SessionLocal
from app.models import Airport, Airline, Route, FareObservation
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

# Booking-window buckets used throughout the app (days-to-departure -> bucket label)
BOOKING_WINDOWS = [90, 60, 30, 14, 7]

# How many months of history to backfill, and how many distinct observation
# days to sample within each month (this is what makes the index a real
# time series instead of a single snapshot).
HISTORY_MONTHS = 6
OBSERVATION_DAYS_PER_MONTH = 4


def seed_reference_data():
    init_db()
    db = SessionLocal()
    try:
        if db.query(Airport).count() == 0:
            for iata, name, city, region, lat, lon in AIRPORTS:
                db.add(Airport(
                    iata_code=iata, name=name, city=city, state=city,
                    region=region, latitude=lat, longitude=lon, is_active=True
                ))
            db.commit()
            print(f"Seeded {len(AIRPORTS)} airports")

        if db.query(Airline).count() == 0:
            for iata, name in AIRLINES:
                db.add(Airline(iata_code=iata, name=name, is_active=True))
            db.commit()
            print(f"Seeded {len(AIRLINES)} airlines")

        if db.query(Route).count() == 0:
            airports = db.query(Airport).all()
            count = 0
            for i, origin in enumerate(airports):
                for dest in airports[i + 1:i + 3]:
                    dist = ((origin.latitude - dest.latitude) ** 2 +
                            (origin.longitude - dest.longitude) ** 2) ** 0.5 * 111
                    db.add(Route(
                        origin_airport_id=origin.id,
                        destination_airport_id=dest.id,
                        distance_km=dist,
                        region=origin.region,
                        importance_score=random.uniform(0.5, 1.0),
                        is_active=True
                    ))
                    count += 1
            db.commit()
            print(f"Seeded {count} routes")
    finally:
        db.close()


def _month_period(d) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def generate_synthetic_observations(force: bool = False):
    """
    Generate a realistic synthetic time series of fare observations spanning
    HISTORY_MONTHS months in the past, so the index engine has an actual base
    period and current period to compare, not one snapshot in time.
    """
    db = SessionLocal()
    try:
        if not force and db.query(FareObservation).count() > 500:
            print("Synthetic data already exists, skipping generation")
            return

        if force:
            db.query(FareObservation).delete()
            db.commit()

        routes = db.query(Route).all()
        airlines = db.query(Airline).all()

        today = datetime.utcnow().date()
        obs_count = 0

        # Build the list of "observation dates" going back HISTORY_MONTHS
        # months, sampling a handful of days per month so trends are visible
        # without generating an unreasonable amount of data.
        observation_dates = []
        for month_offset in range(HISTORY_MONTHS, -1, -1):
            anchor = today.replace(day=1) - timedelta(days=month_offset * 30)
            for day_offset in range(OBSERVATION_DAYS_PER_MONTH):
                obs_date = anchor + timedelta(days=day_offset * 7 + 1)
                if obs_date <= today:
                    observation_dates.append(obs_date)

        # Overall upward drift so the index shows a realistic trend
        # (e.g. fuel cost / demand growth over the period), plus per-route
        # noise and a seasonal (festive-season) bump in the most recent month.
        total_periods = len(observation_dates)

        for route in routes[:12]:
            base_price = 3000 + route.distance_km * 2
            for period_idx, obs_date in enumerate(observation_dates):
                # Gradual upward drift across the whole history (0% -> ~18%)
                drift = 1.0 + 0.18 * (period_idx / max(total_periods - 1, 1))
                # Seasonal bump for the most recent period (simulates a
                # holiday/event period, also feeds the events/anomaly demo)
                seasonal = 1.15 if period_idx == total_periods - 1 else 1.0

                for airline in airlines:
                    airline_variance = random.uniform(0.92, 1.08)
                    for days_ahead in BOOKING_WINDOWS:
                        travel_date = obs_date + timedelta(days=days_ahead)

                        # Closer to departure -> higher fare
                        booking_multiplier = 1.0 + (90 - days_ahead) / 90 * 0.45

                        noise = random.uniform(0.95, 1.05)
                        fare = base_price * drift * seasonal * airline_variance * booking_multiplier * noise

                        obs = FareObservation(
                            route_id=route.id,
                            airline_id=airline.id,
                            flight_id=None,
                            source="SYNTHETIC",
                            source_type="DEMO",
                            travel_date=str(travel_date),
                            observation_timestamp=datetime.combine(obs_date, datetime.min.time()),
                            days_to_departure=days_ahead,
                            fare_class="ECONOMY_STANDARD",
                            base_fare=round(fare * 0.85, 2),
                            taxes=round(fare * 0.12, 2),
                            fees=round(fare * 0.03, 2),
                            total_fare=round(fare, 2),
                            currency="INR",
                            baggage_kg=20,
                            refundable=random.choice([True, False]),
                            stops=random.choice([0, 0, 1]),
                            duration_minutes=int(route.distance_km / 800 * 60 + random.randint(-30, 30)),
                            is_valid=True,
                            validation_status="VALID",
                            anomaly_status="NORMAL",
                            data_type="SYNTHETIC",
                        )
                        db.add(obs)
                        obs_count += 1

        db.commit()

        # Inject a small number of clearly-anomalous observations so the
        # anomaly detection dashboard has something real to show.
        _inject_anomalies(db, routes[:3], airlines[0])

        print(f"Generated {obs_count} synthetic observations across "
              f"{len(observation_dates)} observation dates "
              f"({observation_dates[0]} to {observation_dates[-1]})")
    finally:
        db.close()


def _inject_anomalies(db, routes, airline):
    today = datetime.utcnow().date()
    for route in routes:
        recent = (
            db.query(FareObservation)
            .filter(FareObservation.route_id == route.id)
            .order_by(FareObservation.observation_timestamp.desc())
            .first()
        )
        if not recent:
            continue
        spike_fare = recent.total_fare * random.uniform(1.8, 2.6)
        db.add(FareObservation(
            route_id=route.id,
            airline_id=airline.id,
            flight_id=None,
            source="SYNTHETIC",
            source_type="DEMO",
            travel_date=str(today + timedelta(days=7)),
            observation_timestamp=datetime.utcnow(),
            days_to_departure=7,
            fare_class="ECONOMY_STANDARD",
            base_fare=round(spike_fare * 0.85, 2),
            taxes=round(spike_fare * 0.12, 2),
            fees=round(spike_fare * 0.03, 2),
            total_fare=round(spike_fare, 2),
            currency="INR",
            baggage_kg=20,
            refundable=True,
            stops=0,
            duration_minutes=int(route.distance_km / 800 * 60),
            is_valid=True,
            validation_status="VALID",
            anomaly_status="PENDING_REVIEW",
            data_type="SYNTHETIC",
        ))
    db.commit()


if __name__ == "__main__":
    seed_reference_data()
    generate_synthetic_observations()
