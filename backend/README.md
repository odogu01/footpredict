# FootPredict Backend API

Backend API for the Football Match Outcome Prediction System.

## Prerequisites

- Node.js v16+
- MySQL 8.0+
- npm

## Setup

1. **Install dependencies**

```bash
cd backend
npm install
```

2. **Environment variables**

Copy `.env` to the same directory and fill in your MySQL credentials:

```
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=footpredict
MODEL_SERVICE_URL=http://localhost:5001
FRONTEND_URL=http://localhost:3000
```

3. **Database setup**

Run the following SQL in your MySQL client:

```sql
CREATE DATABASE IF NOT EXISTS footpredict;
USE footpredict;

CREATE TABLE leagues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  code VARCHAR(10) UNIQUE NOT NULL
);

INSERT INTO leagues (name, code) VALUES
('English Premier League', 'EPL'),
('Spanish La Liga', 'LALIGA'),
('Italian Serie A', 'SERIEA'),
('German Bundesliga', 'BUNDES'),
('French Ligue 1', 'LIGUE1');

CREATE TABLE teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  league_id INT NOT NULL,
  elo_rating INT DEFAULT 1500,
  FOREIGN KEY (league_id) REFERENCES leagues(id)
);

INSERT INTO teams (name, league_id, elo_rating) VALUES
('Arsenal', 1, 1650), ('Manchester City', 1, 1720), ('Liverpool', 1, 1680), ('Chelsea', 1, 1580), ('Tottenham', 1, 1560),
('Real Madrid', 2, 1700), ('Barcelona', 2, 1660), ('Atletico Madrid', 2, 1600), ('Sevilla', 2, 1520), ('Real Sociedad', 2, 1500),
('Inter Milan', 3, 1640), ('AC Milan', 3, 1620), ('Juventus', 3, 1610), ('Napoli', 3, 1580), ('Roma', 3, 1540),
('Bayern Munich', 4, 1710), ('Borussia Dortmund', 4, 1620), ('RB Leipzig', 4, 1580), ('Bayer Leverkusen', 4, 1600), ('Eintracht Frankfurt', 4, 1520),
('Paris Saint-Germain', 5, 1690), ('Marseille', 5, 1560), ('Monaco', 5, 1550), ('Lyon', 5, 1530), ('Lille', 5, 1510);

CREATE TABLE matches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  league_id INT NOT NULL,
  home_team_id INT NOT NULL,
  away_team_id INT NOT NULL,
  match_date DATE NOT NULL,
  home_score INT,
  away_score INT,
  status ENUM('scheduled', 'played') DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  FOREIGN KEY (home_team_id) REFERENCES teams(id),
  FOREIGN KEY (away_team_id) REFERENCES teams(id)
);

CREATE TABLE team_form (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  match_date DATE NOT NULL,
  points_3 INT DEFAULT 0,
  goals_for_3 INT DEFAULT 0,
  goals_against_3 INT DEFAULT 0,
  points_5 INT DEFAULT 0,
  goals_for_5 INT DEFAULT 0,
  goals_against_5 INT DEFAULT 0,
  points_10 INT DEFAULT 0,
  goals_for_10 INT DEFAULT 0,
  goals_against_10 INT DEFAULT 0,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  INDEX idx_team_date (team_id, match_date)
);

CREATE TABLE head_to_head (
  id INT AUTO_INCREMENT PRIMARY KEY,
  home_team_id INT NOT NULL,
  away_team_id INT NOT NULL,
  home_wins INT DEFAULT 0,
  draws INT DEFAULT 0,
  away_wins INT DEFAULT 0,
  home_goals INT DEFAULT 0,
  away_goals INT DEFAULT 0,
  total_matches INT DEFAULT 0,
  FOREIGN KEY (home_team_id) REFERENCES teams(id),
  FOREIGN KEY (away_team_id) REFERENCES teams(id),
  UNIQUE KEY uk_h2h (home_team_id, away_team_id)
);
```

4. **Run the server**

```bash
npm run dev
```

The API will start on `http://localhost:5000`.

## API Endpoints

### `GET /api/leagues`
Returns all leagues.

### `GET /api/teams?league=English Premier League`
Returns teams for a given league. Omit query param to get all teams.

### `POST /api/predict`
Core prediction endpoint.

**Request body:**
```json
{
  "homeTeam": 1,
  "awayTeam": 2,
  "league": "English Premier League",
  "matchDate": "2025-05-10"
}
```

**Response:**
```json
{
  "success": true,
  "predictedOutcome": "H",
  "probabilities": { "home": 65, "draw": 20, "away": 15 },
  "confidence": "High",
  "keyFactors": ["..."]
}
```

### `GET /api/stats`
Returns model performance metrics.

### `GET /api/health`
Health check.

## Testing with curl

```bash
curl -X POST http://localhost:5000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"homeTeam":1,"awayTeam":2,"league":"English Premier League","matchDate":"2025-05-10"}'
```

## Architecture

```
Frontend (Vanilla JS)  →  Express API  →  Feature Engineering  →  Python XGBoost (Phase 3)
                                        ↘  Elo Fallback (when Python unavailable)
```
