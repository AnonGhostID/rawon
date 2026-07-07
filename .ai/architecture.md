# Architecture

Cross-ref: [`repo-map.md`](./repo-map.md), [`database.md`](./database.md), [`api.md`](./api.md)

## Overall architecture

- Event-driven Discord application built around `Rawon` client.
- Command execution can start from prefix messages, slash commands, request-channel buttons, and select menus.
- Music state is modeled per guild via `guild.queue` (`ServerQueue`) with persisted queue/player state.
- Supports 3 runtime topologies:
  - single bot process
  - multi-bot (multiple tokens, coordinated by `MultiBotManager`)
  - shard workers (Discord sharding manager)

Core files:
- [`src/index.ts`](../src/index.ts)
- [`src/bot.ts`](../src/bot.ts)
- [`src/structures/Rawon.ts`](../src/structures/Rawon.ts)
- [`src/structures/ServerQueue.ts`](../src/structures/ServerQueue.ts)

## Request flow

1. Discord event enters listener:
   - message path: [`MessageCreateListener`](../src/listeners/MessageCreateListener.ts)
   - interaction path: [`InteractionCreateListener`](../src/listeners/InteractionCreateListener.ts)
2. Listener resolves responsibility (multibot routing, request-channel checks, permissions).
3. Listener dispatches to command `contextRun` via command store compatibility layer.
4. Music commands call search + queue utilities:
   - [`searchTrack`](../src/utils/handlers/general/searchTrack.ts)
   - [`handleVideos`](../src/utils/handlers/general/handleVideos.ts)
   - [`play`](../src/utils/handlers/general/play.ts)
5. Queue/player updates trigger request-channel message refresh and persistence.

## Data flow

- Config/env load: [`src/config/env.ts`](../src/config/env.ts) -> exported via [`src/config/index.ts`](../src/config/index.ts).
- Runtime state:
  - in-memory queue/player per guild in `ServerQueue`
  - persistent state in `SQLiteDataManager`
- Persistence write paths:
  - queue state (`saveQueueState`)
  - player state (`saveState` -> `savePlayerState`)
  - request channel + player message IDs
  - guild settings (prefix, locale, DJ role)
- Startup restore path: [`ReadyListener.restoreQueueStates`](../src/listeners/ReadyListener.ts)

## Authentication

- Discord auth: bot token(s) from env; supports comma-separated multi-token mode.
- Spotify auth: client credentials grant via `SpotifyUtil.fetchTokenWithRetries`.
- YouTube anti-bot auth: Google login cookie session managed by:
  - [`LoginCommand`](../src/commands/developers/LoginCommand.ts)
  - [`CookiesManager`](../src/utils/structures/CookiesManager.ts)
  - [`GoogleLoginManager`](../src/utils/structures/GoogleLoginManager.ts)

## Services / subsystems

- Command handling compatibility: `CommandsCompatibility` in [`Rawon.ts`](../src/structures/Rawon.ts)
- Queue/playback orchestration: [`ServerQueue`](../src/structures/ServerQueue.ts)
- Media provider integration: [`GeneralUtil`](../src/utils/handlers/GeneralUtil.ts), [`YTDLUtil`](../src/utils/handlers/YTDLUtil.ts), [`SpotifyUtil`](../src/utils/handlers/SpotifyUtil.ts), [`YouTubeUtil`](../src/utils/handlers/YouTubeUtil.ts)
- Request channel UI manager: [`RequestChannelManager`](../src/utils/structures/RequestChannelManager.ts)
- Audio pre-cache: [`AudioCacheManager`](../src/utils/structures/AudioCacheManager.ts)
- Multi-bot coordination: [`MultiBotManager`](../src/utils/structures/MultiBotManager.ts), [`MultiBotLauncher`](../src/utils/structures/MultiBotLauncher.ts)
- Data backend abstraction: [`DatabaseBackend`](../src/utils/structures/DatabaseBackend.ts)

## Background jobs / timers

- Spotify token renewal loop (`SpotifyUtil.renew`).
- ytdlp auto-updater (started in `ReadyListener`, stopped on shutdown).
- Queue position autosave interval (`ServerQueue.startPositionSaveInterval`).
- Voice idle timeout auto-destroy (`VoiceStateUpdateListener.timeout`).
- Request-channel UI debounced updater (`RequestChannelManager.updatePlayerMessage`).
- Audio pre-cache queue processor (`AudioCacheManager.processQueue`).

## Dependency graph (high-level)

```text
listeners/*
  -> structures/Rawon + structures/CommandContext
  -> commands/* (indirect via command registry/dispatch)
  -> structures/ServerQueue (music lifecycle)

structures/ServerQueue
  -> utils/handlers/GeneralUtil (play/search/check)
  -> utils/structures/SongManager
  -> utils/structures/RequestChannelManager
  -> utils/structures/SQLiteDataManager

utils/handlers/general/play
  -> utils/handlers/YTDLUtil
  -> utils/functions/ffmpegArgs + i18n + embeds
  -> @discordjs/voice + prism-media

utils/structures/SQLiteDataManager
  -> utils/structures/DatabaseBackend (local/remote DB)
  -> utils/structures/OperationManager
```

Detected circular imports: 36 cycles (see [`dependencies.md`](./dependencies.md)).

## Notes for future updates

- Keep this file focused on flow changes (listener routing, queue lifecycle, DB/auth/service boundaries).
- Update only touched sections after code changes.
