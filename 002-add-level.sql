-- add level column to users (default 1)
ALTER TABLE users ADD COLUMN level INTEGER NOT NULL DEFAULT 1;

-- backfill level from xp (level = floor(xp / 100) + 1)
UPDATE users SET level = (CAST(xp / 100 AS INTEGER) + 1);
