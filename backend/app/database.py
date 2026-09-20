from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

engine = create_engine(settings.database_url, echo=False, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from app.models import Airport, Airline, Route, Flight, FareObservation, RoutesBasket, IndexValue, RouteIndexValue, AirlineIndexValue, Anomaly, Event, ScrapingRun, SourceHealth
    Base.metadata.create_all(bind=engine)
