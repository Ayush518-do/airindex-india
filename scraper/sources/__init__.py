"""Source registry. Add a source here to make it available to run.py / scheduler.py."""
from scraper.sources.easemytrip import EaseMyTripSource
from scraper.sources.spicejet import SpiceJetSource

SOURCES = {
    EaseMyTripSource.name: EaseMyTripSource,
    SpiceJetSource.name: SpiceJetSource,
}
