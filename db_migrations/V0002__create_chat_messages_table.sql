CREATE TABLE IF NOT EXISTS t_p74278794_super_bear_adventure.chat_messages (
  id SERIAL PRIMARY KEY,
  room_code VARCHAR(6) NOT NULL,
  player_id VARCHAR(64) NOT NULL,
  role VARCHAR(8) NOT NULL DEFAULT 'host',
  message VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_room ON t_p74278794_super_bear_adventure.chat_messages(room_code, created_at DESC);
