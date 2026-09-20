from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Airport(Base):
    __tablename__ = "airports"
    id = Column(Integer, primary_key=True)
    iata_code = Column(String(3), unique=True, index=True)
    name = Column(String(255))
    city = Column(String(100))
    state = Column(String(100))
    region = Column(String(50))
    latitude = Column(Float)
    longitude = Column(Float)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Airline(Base):
    __tablename__ = "airlines"
    id = Column(Integer, primary_key=True)
    iata_code = Column(String(3), unique=True, index=True)
    name = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Route(Base):
    __tablename__ = "routes"
    id = Column(Integer, primary_key=True)
    origin_airport_id = Column(Integer, ForeignKey("airports.id"))
    destination_airport_id = Column(Integer, ForeignKey("airports.id"))
    distance_km = Column(Float)
    region = Column(String(50))
    importance_score = Column(Float, default=0.5)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    origin_airport = relationship("Airport", foreign_keys=[origin_airport_id], lazy="joined")
    destination_airport = relationship("Airport", foreign_keys=[destination_airport_id], lazy="joined")

class Flight(Base):
    __tablename__ = "flights"
    id = Column(Integer, primary_key=True)
    route_id = Column(Integer, ForeignKey("routes.id"))
    airline_id = Column(Integer, ForeignKey("airlines.id"))
    flight_number = Column(String(20))
    departure_time = Column(String(10))
    arrival_time = Column(String(10))
    duration_minutes = Column(Integer)
    stops = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class FareObservation(Base):
    __tablename__ = "fare_observations"
    id = Column(Integer, primary_key=True)
    route_id = Column(Integer, ForeignKey("routes.id"), index=True)
    airline_id = Column(Integer, ForeignKey("airlines.id"))
    flight_id = Column(Integer, ForeignKey("flights.id"), nullable=True)
    source = Column(String(50))
    source_type = Column(String(50))
    travel_date = Column(String(10), index=True)
    observation_timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    days_to_departure = Column(Integer)
    fare_class = Column(String(50))
    base_fare = Column(Float)
    taxes = Column(Float, default=0)
    fees = Column(Float, default=0)
    total_fare = Column(Float)
    currency = Column(String(3), default="INR")
    baggage_kg = Column(Integer, default=20)
    refundable = Column(Boolean, default=True)
    stops = Column(Integer, default=0)
    duration_minutes = Column(Integer)
    raw_data_reference = Column(Text, nullable=True)
    is_valid = Column(Boolean, default=True)
    validation_status = Column(String(20), default="VALID")
    anomaly_status = Column(String(50), default="NORMAL")
    data_type = Column(String(50), default="SYNTHETIC")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    __table_args__ = (Index('idx_route_date_timestamp', 'route_id', 'travel_date', 'observation_timestamp'),)

class RoutesBasket(Base):
    __tablename__ = "routes_basket"
    id = Column(Integer, primary_key=True)
    route_id = Column(Integer, ForeignKey("routes.id"))
    weight = Column(Float, default=0.0)
    selection_score = Column(Float, default=0.0)
    basket_period = Column(String(10))
    selection_reason = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class IndexValue(Base):
    __tablename__ = "index_values"
    id = Column(Integer, primary_key=True)
    index_name = Column(String(100))
    index_value = Column(Float)
    base_period = Column(String(10))
    calculation_period = Column(String(10), index=True)
    route_count = Column(Integer)
    observation_count = Column(Integer)
    data_quality_score = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

class RouteIndexValue(Base):
    __tablename__ = "route_index_values"
    id = Column(Integer, primary_key=True)
    route_id = Column(Integer, ForeignKey("routes.id"))
    period = Column(String(10), index=True)
    index_value = Column(Float)
    price_relative = Column(Float)
    weight = Column(Float)
    contribution = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

class AirlineIndexValue(Base):
    __tablename__ = "airline_index_values"
    id = Column(Integer, primary_key=True)
    airline_id = Column(Integer, ForeignKey("airlines.id"))
    period = Column(String(10), index=True)
    index_value = Column(Float)
    contribution = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

class Anomaly(Base):
    __tablename__ = "anomalies"
    id = Column(Integer, primary_key=True)
    fare_observation_id = Column(Integer, ForeignKey("fare_observations.id"))
    route_id = Column(Integer, ForeignKey("routes.id"))
    detected_at = Column(DateTime, default=datetime.utcnow)
    algorithm = Column(String(50))
    expected_value = Column(Float)
    actual_value = Column(Float)
    deviation = Column(Float)
    severity = Column(String(20))
    status = Column(String(20), default="PENDING")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True)
    name = Column(String(255))
    event_type = Column(String(50))
    start_date = Column(String(10))
    end_date = Column(String(10))
    region = Column(String(100))
    source = Column(String(100))
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

class ScrapingRun(Base):
    __tablename__ = "scraping_runs"
    id = Column(Integer, primary_key=True)
    source = Column(String(100))
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="IN_PROGRESS")
    records_found = Column(Integer, default=0)
    records_valid = Column(Integer, default=0)
    records_invalid = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

class SourceHealth(Base):
    __tablename__ = "source_health"
    id = Column(Integer, primary_key=True)
    source = Column(String(100), unique=True, index=True)
    last_successful_run = Column(DateTime, nullable=True)
    last_failed_run = Column(DateTime, nullable=True)
    success_rate = Column(Float, default=0.0)
    records_last_run = Column(Integer, default=0)
    status = Column(String(20), default="UNKNOWN")
    created_at = Column(DateTime, default=datetime.utcnow)
