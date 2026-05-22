CREATE TABLE IF NOT EXISTS t_p74278794_super_bear_adventure.rooms (
  id SERIAL PRIMARY KEY,
  code VARCHAR(6) NOT NULL UNIQUE,
  host_id VARCHAR(64) NOT NULL,
  guest_id VARCHAR(64),
  world_id INTEGER NOT NULL DEFAULT 1,
  world_name VARCHAR(64) NOT NULL DEFAULT 'Лесной мир',
  world_emoji VARCHAR(8) NOT NULL DEFAULT '🌲',
  status VARCHAR(16) NOT NULL DEFAULT 'waiting',
  host_x FLOAT NOT NULL DEFAULT 0,
  host_y FLOAT NOT NULL DEFAULT 1.5,
  host_emotion VARCHAR(16) NOT NULL DEFAULT 'idle',
  guest_x FLOAT NOT NULL DEFAULT 2,
  guest_y FLOAT NOT NULL DEFAULT 1.5,
  guest_emotion VARCHAR(16) NOT NULL DEFAULT 'idle',
  coins_collected TEXT NOT NULL DEFAULT '',
  enemies_alive TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON t_p74278794_super_bear_adventure.rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON t_p74278794_super_bear_adventure.rooms(status);
