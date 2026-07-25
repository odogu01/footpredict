"""
Football-data.org integration service.
Fetches match fixtures from https://www.football-data.org/ API.
Used alongside livescore-api for broader competition coverage (World Cup, UCL, etc.).
"""

import os
import logging
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://api.football-data.org/v4"

# Map our competition names to football-data.org competition codes
COMPETITION_CODES = {
    "premier league": "PL",
    "la liga": "PD",
    "serie a": "SA",
    "bundesliga": "BL1",
    "ligue 1": "FL1",
    "world cup": "WC",
    "uefa champions league": "CL",
    "uefa europa league": "EL",
    "uefa conference league": "ECL",
    "fa cup": "FAC",
    "copa del rey": "CDR",
    "dfb pokal": "DFB",
    "coppa italia": "CI",
    "coupe de france": "CF",
}

# Map football-data.org status to our status strings
STATUS_MAP = {
    "SCHEDULED": "NS",
    "TIMED": "NS",
    "IN_PLAY": "LIVE",
    "PAUSED": "HT",
    "FINISHED": "FT",
    "SUSPENDED": "SUSP",
    "POSTPONED": "POST",
    "CANCELLED": "CANC",
    "AWARDED": "FT",
}


def get_api_key():
    """Get the football-data.org API key from environment or .env file."""
    key = os.environ.get("FOOTBALL_DATA_API_KEY", "")
    if not key:
        # Fallback: try reading from .env in the project root
        env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
        if os.path.isfile(env_path):
            with open(env_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("FOOTBALL_DATA_API_KEY="):
                        key = line.split("=", 1)[1].strip().strip("'\"")
                        break
    if not key:
        logger.warning("FOOTBALL_DATA_API_KEY not set — football-data.org service disabled")
    else:
        logger.info("football-data.org API key loaded")
    return key


def fetch_competition_matches(competition_code, date_from=None, date_to=None):
    """
    Fetch matches for a specific competition from football-data.org.

    Args:
        competition_code: e.g. "WC", "PL", "CL"
        date_from: YYYY-MM-DD or None
        date_to: YYYY-MM-DD or None

    Returns:
        List of raw match dicts from the API, or empty list on error.
    """
    api_key = get_api_key()
    if not api_key:
        return []

    headers = {"X-Auth-Token": api_key}
    params = {}
    if date_from:
        params["dateFrom"] = date_from
    if date_to:
        params["dateTo"] = date_to

    url = f"{BASE_URL}/competitions/{competition_code}/matches"
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            matches = data.get("matches", [])
            logger.info(f"football-data.org: fetched {len(matches)} matches for {competition_code}")
            return matches
        elif resp.status_code == 403:
            logger.warning(f"football-data.org: 403 Forbidden — check API key or plan limits")
            return []
        elif resp.status_code == 404:
            logger.info(f"football-data.org: competition {competition_code} not found")
            return []
        elif resp.status_code == 429:
            logger.warning("football-data.org: rate limited (429)")
            return []
        else:
            logger.warning(f"football-data.org: HTTP {resp.status_code} for {competition_code}")
            return []
    except requests.exceptions.Timeout:
        logger.warning("football-data.org: request timed out")
        return []
    except requests.exceptions.ConnectionError:
        logger.warning("football-data.org: connection error")
        return []
    except Exception as e:
        logger.warning(f"football-data.org: unexpected error: {e}")
        return []


def normalize_match(raw):
    """
    Normalize a football-data.org match dict into our internal format.

    Returns dict with keys:
        home_team, away_team, league, kickoff, status,
        home_score, away_score, source
    Returns None if the match cannot be parsed.
    """
    try:
        home_team = raw.get("homeTeam", {}).get("name", "")
        away_team = raw.get("awayTeam", {}).get("name", "")
        if not home_team or not away_team:
            return None

        # Competition name
        comp = raw.get("competition", {})
        league = comp.get("name", "")

        # Stage info adds context (e.g. "GROUP_STAGE", "ROUND_16")
        stage = raw.get("stage", "")
        if stage and stage not in ("REGULAR_SEASON",):
            stage_label = stage.replace("_", " ").title()
            if stage_label and stage_label not in league:
                league = f"{league} - {stage_label}"

        # Kickoff: UTC ISO -> YYYY-MM-DD HH:MM
        utc_date = raw.get("utcDate", "")
        kickoff = ""
        if utc_date:
            try:
                dt = datetime.fromisoformat(utc_date.replace("Z", "+00:00"))
                kickoff = dt.strftime("%Y-%m-%d %H:%M")
            except (ValueError, AttributeError):
                kickoff = utc_date[:10] if len(utc_date) >= 10 else ""

        # Status mapping
        raw_status = raw.get("status", "SCHEDULED")
        status = STATUS_MAP.get(raw_status, "NS")

        # Scores
        score = raw.get("score", {})
        ft = score.get("fullTime", {}) if isinstance(score, dict) else {}
        home_score = ft.get("home") if isinstance(ft, dict) else None
        away_score = ft.get("away") if isinstance(ft, dict) else None

        return {
            "home_team": home_team,
            "away_team": away_team,
            "league": league,
            "kickoff": kickoff,
            "status": status,
            "home_score": home_score,
            "away_score": away_score,
            "source": "football-data.org",
        }
    except Exception as e:
        logger.warning(f"football-data.org: failed to normalize match: {e}")
        return None


def fetch_matches(competition, date_filter="", date_str=""):
    """
    Main entry point: fetch matches from football-data.org for a given competition.

    Args:
        competition: Our competition name (e.g. "World Cup", "Premier League")
        date_filter: Date string "YYYY-MM-DD" or ""
        date_str: Same date in "YYYYMMDD" format

    Returns:
        List of normalized match dicts, or empty list.
    """
    comp_lower = competition.lower().strip()
    code = COMPETITION_CODES.get(comp_lower)

    if not code:
        logger.info(f"football-data.org: no competition code for '{competition}'")
        return []

    # Fetch matches — include a date range if we have it
    date_from = date_filter if date_filter else None
    date_to = date_filter if date_filter else None

    raw_matches = fetch_competition_matches(code, date_from, date_to)
    if not raw_matches:
        return []

    normalized = []
    for m in raw_matches:
        nm = normalize_match(m)
        if nm:
            normalized.append(nm)

    logger.info(f"football-data.org: {len(normalized)} normalized matches for {competition}")
    return normalized
