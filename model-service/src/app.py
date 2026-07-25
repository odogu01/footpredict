import os
import json
import logging
from datetime import datetime, date

from flask import Flask, request, jsonify
from flask_cors import CORS

from football_data_service import fetch_matches as fetch_fd_matches

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

MAPPING_PATH = os.path.join(os.path.dirname(__file__), 'team_mapping.json')

try:
    with open(MAPPING_PATH, 'r', encoding='utf-8') as f:
        TEAM_MAPPING = json.load(f)
    logger.info(f"Loaded {len(TEAM_MAPPING)} team name mappings")
except Exception as e:
    logger.warning(f"Could not load team_mapping.json: {e}")
    TEAM_MAPPING = {}


def normalize_team_name(raw_name):
    canonical = TEAM_MAPPING.get(raw_name)
    if canonical:
        return {"name": canonical, "requires_mapping": False}
    return {"name": raw_name, "requires_mapping": True}


def parse_date_param(date_str):
    if not date_str:
        return date.today()
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"Invalid date format: {date_str}. Use YYYY-MM-DD.")


def normalize_livescore_match(m):
    """Normalize a single livescore-api match dict into our standard format."""
    home = normalize_team_name(m.get("Home", ""))
    away = normalize_team_name(m.get("Away", ""))
    league = m.get("League", "")
    country = m.get("Country", "")
    raw_kickoff = m.get("Kickoff", "")
    status = m.get("Status", "NS")

    # Parse actual match date/time from YYYYMMDDHHMMSS
    kickoff_str = str(raw_kickoff)
    kickoff = ""
    if len(kickoff_str) >= 14:
        kickoff = f"{kickoff_str[:4]}-{kickoff_str[4:6]}-{kickoff_str[6:8]} {kickoff_str[8:10]}:{kickoff_str[10:12]}"
    elif len(kickoff_str) >= 12:
        kickoff = f"{kickoff_str[:4]}-{kickoff_str[4:6]}-{kickoff_str[6:8]} {kickoff_str[8:10]}:{kickoff_str[10:12]}"

    # Build a display league name combining country + league
    display_league = str(league)
    country_str = str(country)
    if country_str and country_str not in display_league:
        if "World Cup" in country_str or "Cup" in country_str or "Champions" in country_str:
            display_league = country_str

    return {
        "home_team": home["name"],
        "away_team": away["name"],
        "league": display_league,
        "kickoff": kickoff,
        "status": status,
        "home_score": m.get("H Scores"),
        "away_score": m.get("A Scores"),
        "home_requires_mapping": home["requires_mapping"],
        "away_requires_mapping": away["requires_mapping"],
        "source": "livescore-api"
    }


def deduplicate_matches(matches):
    """Remove duplicates by (home_team, away_team) — keep first occurrence (higher priority)."""
    seen = set()
    unique = []
    for m in matches:
        key = (m.get("home_team", "").lower().strip(), m.get("away_team", "").lower().strip())
        if key not in seen and key[0] and key[1]:
            seen.add(key)
            unique.append(m)
    return unique


@app.route("/fixtures", methods=["GET"])
def get_fixtures():
    date_param = request.args.get("date", "")
    competition = request.args.get("competition", "").strip()
    try:
        match_date = parse_date_param(date_param)
    except ValueError as e:
        return jsonify({"success": False, "message": str(e)}), 400

    date_str = match_date.isoformat()
    date_prefix = match_date.strftime("%Y%m%d")

    all_normalized = []

    # --- SOURCE 1: football-data.org ---
    # Only when a specific competition is selected and we have a mapping
    if competition:
        try:
            fd_matches = fetch_fd_matches(competition, date_param, date_prefix)
            all_normalized.extend(fd_matches)
            if fd_matches:
                logger.info(f"Got {len(fd_matches)} matches from football-data.org for {competition}")
        except Exception as e:
            logger.warning(f"football-data.org error: {e}")

    # --- SOURCE 2: livescore-api ---
    try:
        from livescore_api import livescore
        client = livescore()
        raw_matches = client.matches()
        logger.info(f"livescore-api: fetched {len(raw_matches)} matches")
    except ImportError as e:
        logger.error(f"livescore-api import failed: {e}")
        raw_matches = []
    except Exception as e:
        logger.warning(f"livescore-api error: {e}")
        raw_matches = []

    if raw_matches:
        if competition:
            comp_lower = competition.lower()
            ls_filtered = [
                m for m in raw_matches if isinstance(m, dict)
                and (comp_lower in str(m.get("League", "")).lower()
                     or comp_lower in str(m.get("Country", "")).lower())
            ]
        else:
            ls_filtered = [
                m for m in raw_matches if isinstance(m, dict)
                and str(m.get("Kickoff", "")).startswith(date_prefix)
            ]

        for m in ls_filtered:
            try:
                all_normalized.append(normalize_livescore_match(m))
            except Exception as e:
                logger.warning(f"Skipping malformed livescore match: {e}")
                continue

    # Merge: deduplicate (football-data.org entries come first = higher priority)
    merged = deduplicate_matches(all_normalized)

    message = ""
    if not merged:
        if competition:
            message = f"No matches found for {competition}"
        else:
            message = "No matches scheduled for this date"

    return jsonify({
        "success": True,
        "date": date_str,
        "matches": merged,
        "message": message
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "footpredict-model"})


@app.route("/predict", methods=["POST"])
def predict():
    body = request.get_json(silent=True) or {}
    features = body.get("features", [])
    if not features:
        return jsonify({"success": False, "message": "No features provided"}), 400
    return jsonify({
        "success": True,
        "predictedOutcome": "H",
        "probabilities": {"home": 60, "draw": 25, "away": 15},
        "confidence": "Medium",
        "keyFactors": ["XGBoost model not yet trained - returning default"]
    })


if __name__ == "__main__":
    # Read PORT from .env as fallback
    port_env = os.environ.get("PORT", "")
    if not port_env:
        env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
        if os.path.isfile(env_path):
            with open(env_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("PORT="):
                        port_env = line.split("=", 1)[1].strip().strip("'\"")
                        break
    port = int(port_env) if port_env else 5001
    app.run(host="0.0.0.0", port=port, debug=True)
