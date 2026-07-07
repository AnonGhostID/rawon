# Database

Primary implementation: [`SQLiteDataManager`](../src/utils/structures/SQLiteDataManager.ts)
Backend abstraction: [`DatabaseBackend`](../src/utils/structures/DatabaseBackend.ts)

## Engines

- Local: `better-sqlite3` (`LocalBackend`)
- Remote: Turso/libSQL via `@libsql/client` (`RemoteBackend`)
- Selection: `useRemoteDb` flag from [`src/config/env.ts`](../src/config/env.ts)

## Schema

### `guilds`
- PK: `guild_id TEXT`
- Columns: `locale TEXT`, `dj_enable INTEGER DEFAULT 0`, `dj_role TEXT`, `prefix TEXT DEFAULT ''` (migration-added)
- Purpose: guild-level preferences.

### `request_channels`
- PK: `(guild_id, bot_id)`
- FK: `guild_id -> guilds(guild_id) ON DELETE CASCADE`
- Columns: `channel_id`, `message_id`
- Purpose: per-bot request channel/panel message per guild.

### `player_states`
- PK: `(guild_id, bot_id)`
- FK: `guild_id -> guilds(guild_id) ON DELETE CASCADE`
- Columns: `loop_mode`, `shuffle`, `autoplay` (migration-added), `stay_in_channel` (migration-added), `volume`, `filters_json`
- Purpose: persisted playback settings.

### `queue_states`
- PK: `(guild_id, bot_id)`
- FK: `guild_id -> guilds(guild_id) ON DELETE CASCADE`
- Columns: `text_channel_id`, `voice_channel_id`, `songs_json`, `current_song_key`, `current_position`
- Purpose: queue restoration after restart/crash.

### `bot_settings`
- PK constraint: `id INTEGER PRIMARY KEY CHECK (id = 1)`
- Single-row config table: embed color/emojis/alt prefixes/splash/default volume/selection type/audio cache toggle.

### `login_session` (Google login module)
- Defined in [`GoogleLoginManager.initDB`](../src/utils/structures/GoogleLoginManager.ts)
- PK-like singleton row (`id=1`) with columns: `was_running`, `email`, `visitor_data`, `saved_at`
- Purpose: persist login session metadata.

## Migrations / evolution

Executed at startup (`initSchema`):
- `CREATE TABLE IF NOT EXISTS` for all core tables.
- Conditional `ALTER TABLE` for missing columns:
  - `guilds.prefix`
  - `player_states.autoplay`
  - `player_states.stay_in_channel`
- `INSERT OR IGNORE INTO bot_settings(id=1)` singleton bootstrap.

## Relationships

- `guilds` is parent table.
- `request_channels`, `player_states`, `queue_states` reference `guilds` by FK + cascade delete.
- logical per-bot partitioning by `bot_id` in child tables.

## Indexes

Created explicitly:
- `idx_queue_states_guild`, `idx_queue_states_bot`
- `idx_player_states_guild`, `idx_player_states_bot`
- `idx_request_channels_guild`, `idx_request_channels_bot`

## Constraints

- Composite primary keys enforce uniqueness per guild+bot for queue/player/request-channel state.
- Foreign keys enabled (`PRAGMA foreign_keys = ON` in local backend).
- `bot_settings.id` constrained to singleton row.

## Models (runtime)

Runtime model structures map from [`src/typings/index.d.ts`](../src/typings/index.d.ts):
- `GuildData` (locale/prefix/dj/requestChannel/playerState/queueState)
- `BotSettings`

## Update policy

When schema changes, update only affected table sections and migration notes.
