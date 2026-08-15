-- FootPredict database schema
-- Idempotent: safe to re-run.

CREATE DATABASE IF NOT EXISTS footpredict CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE footpredict;

CREATE TABLE IF NOT EXISTS leagues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  code VARCHAR(10) UNIQUE NOT NULL
);

INSERT IGNORE INTO leagues (name, code) VALUES
('English Premier League', 'EPL'),
('Spanish La Liga', 'LALIGA'),
('Italian Serie A', 'SERIEA'),
('German Bundesliga', 'BUNDES'),
('French Ligue 1', 'LIGUE1');

CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  league_id INT NOT NULL,
  elo_rating INT DEFAULT 1500,
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  UNIQUE KEY uk_team_name (name)
);

CREATE TABLE IF NOT EXISTS matches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  league_id INT NOT NULL,
  home_team_id INT NOT NULL,
  away_team_id INT NOT NULL,
  match_date DATE NOT NULL,
  home_score INT,
  away_score INT,
  referee VARCHAR(100) NULL,
  status ENUM('scheduled', 'played') DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  FOREIGN KEY (home_team_id) REFERENCES teams(id),
  FOREIGN KEY (away_team_id) REFERENCES teams(id),
  UNIQUE KEY uk_match (league_id, home_team_id, away_team_id, match_date)
);

CREATE TABLE IF NOT EXISTS team_form (
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
  UNIQUE KEY uk_team_date (team_id, match_date)
);

CREATE TABLE IF NOT EXISTS head_to_head (
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

-- Elo rating history: team rating on a given date (after all matches played that day)
CREATE TABLE IF NOT EXISTS elo_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  match_date DATE NOT NULL,
  elo_rating INT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  UNIQUE KEY uk_team_date (team_id, match_date)
);
