# Classes Index

Cross-ref: [`functions.md`](./functions.md), [`architecture.md`](./architecture.md)

## Core/runtime classes

| Class | File | Inheritance | Key properties/methods | Responsibility | Collaborators |
|---|---|---|---|---|---|
| `Rawon` | [`src/structures/Rawon.ts`](../src/structures/Rawon.ts) | `SapphireClient` | `build`, `data`, `requestChannelManager`, `audioCache`, `cookies`, `multiBotManager` | Main bot client and service container wiring | listeners, commands, data/cache/login managers |
| `CommandsCompatibility` | [`src/structures/Rawon.ts`](../src/structures/Rawon.ts) | none | `get`, `filter`, `categories`, `handle` | Compatibility wrapper for command store and prefix dispatch | `Rawon`, `CommandContext` |
| `CommandContext` | [`src/structures/CommandContext.ts`](../src/structures/CommandContext.ts) | none | `reply`, `send`, type guards (`isCommand`, `isButton`, ...) | Unified interaction/message context abstraction | commands, listeners |
| `ServerQueue` | [`src/structures/ServerQueue.ts`](../src/structures/ServerQueue.ts) | none | `saveState`, `saveQueueState`, `setFilter`, `destroy`, autoplay/shuffle helpers | Per-guild playback state machine and persistence | `SongManager`, `RequestChannelManager`, `AudioCacheManager`, handlers |
| `BaseCommand` | [`src/structures/BaseCommand.ts`](../src/structures/BaseCommand.ts) | abstract | `execute` | Base class for custom command components | decorators, command manager |
| `BaseEvent` | [`src/structures/BaseEvent.ts`](../src/structures/BaseEvent.ts) | abstract | `execute` | Base class for custom event components | event loader |

## Listener classes

All extend Sapphire `Listener`.

`MessageCreateListener`, `InteractionCreateListener`, `ReadyListener`, `VoiceStateUpdateListener`, `MessageDeleteListener`, `GuildDeleteListener`, `ChannelDeleteListener`, `ChannelUpdateListener`, `DebugListener`, `WarnListener`, `ErrorListener`, `ListenerErrorListener` in [`src/listeners/`](../src/listeners).

Responsibilities: ingest Discord events, enforce multibot routing/guards, dispatch commands, maintain queue/request-channel invariants, handle lifecycle logging/errors.

## Infrastructure/service classes

| Class | File | Inheritance | Responsibility | Key collaborators |
|---|---|---|---|---|
| `SQLiteDataManager<T>` | [`src/utils/structures/SQLiteDataManager.ts`](../src/utils/structures/SQLiteDataManager.ts) | none | Stateful repository and schema migration for guild/bot settings | `DatabaseBackend`, `OperationManager` |
| `LocalBackend` | [`src/utils/structures/DatabaseBackend.ts`](../src/utils/structures/DatabaseBackend.ts) | implements `DatabaseBackend` | Local `better-sqlite3` backend adapter | SQLiteDataManager |
| `RemoteBackend` | [`src/utils/structures/DatabaseBackend.ts`](../src/utils/structures/DatabaseBackend.ts) | implements `DatabaseBackend` | Remote Turso/libSQL backend adapter | SQLiteDataManager |
| `OperationManager` | [`src/utils/structures/OperationManager.ts`](../src/utils/structures/OperationManager.ts) | none | Serializes async DB operations | SQLiteDataManager |
| `RequestChannelManager` | [`src/utils/structures/RequestChannelManager.ts`](../src/utils/structures/RequestChannelManager.ts) | none | Request-channel player panel rendering/state sync | Rawon, ServerQueue, SQLiteDataManager |
| `AudioCacheManager` | [`src/utils/structures/AudioCacheManager.ts`](../src/utils/structures/AudioCacheManager.ts) | none | Audio file pre-cache lifecycle and eviction | YTDLUtil, ServerQueue |
| `MultiBotManager` | [`src/utils/structures/MultiBotManager.ts`](../src/utils/structures/MultiBotManager.ts) | singleton | Multi-token bot ownership/routing decisions | listeners, RequestChannelManager |
| `MultiBotLauncher` | [`src/utils/structures/MultiBotLauncher.ts`](../src/utils/structures/MultiBotLauncher.ts) | none | Start/shutdown orchestration for multi-bot mode | Rawon, MultiBotManager |
| `CookiesManager` | [`src/utils/structures/CookiesManager.ts`](../src/utils/structures/CookiesManager.ts) | none | Cookie-session facade for playback/login commands | GoogleLoginManager |
| `GoogleLoginManager` | [`src/utils/structures/GoogleLoginManager.ts`](../src/utils/structures/GoogleLoginManager.ts) | none | Browser automation + cookie export/session persistence | Puppeteer, DatabaseBackend |
| `SpotifyUtil` | [`src/utils/handlers/SpotifyUtil.ts`](../src/utils/handlers/SpotifyUtil.ts) | none | Spotify API token + entity resolution helpers | Rawon request client |
| `SongManager` | [`src/utils/structures/SongManager.ts`](../src/utils/structures/SongManager.ts) | `Collection<Snowflake, QueueSong>` | Queue-song collection with persistence hooks | ServerQueue |
| `ButtonPagination` | [`src/utils/structures/ButtonPagination.ts`](../src/utils/structures/ButtonPagination.ts) | none | Paginated embed controller via button collectors | command responses |
| `CommandManager` | [`src/utils/structures/CommandManager.ts`](../src/utils/structures/CommandManager.ts) | `Collection<string, CommandComponent>` | Loads legacy command components + slash registration | ClientUtils/import layer |
| `EventsLoader` | [`src/utils/structures/EventsLoader.ts`](../src/utils/structures/EventsLoader.ts) | none | Dynamic listener loader (legacy path) | ClientUtils |
| `ClientUtils` | [`src/utils/structures/ClientUtils.ts`](../src/utils/structures/ClientUtils.ts) | none | Shared helpers (counts/import/decode/git/ffmpeg metadata) | Rawon |
| `DebugLogManager` | [`src/utils/structures/DebugLogManager.ts`](../src/utils/structures/DebugLogManager.ts) | none | structured debug diagnostics | all runtime systems |
| `JSONDataManager<T>` | [`src/utils/structures/JSONDataManager.ts`](../src/utils/structures/JSONDataManager.ts) | none | legacy JSON persistence utility | legacy flows |
| `NoStackError` | [`src/utils/structures/NoStackError.ts`](../src/utils/structures/NoStackError.ts) | `Error` | wraps non-stack rejection reasons | bot process handlers |
| `AllCookiesFailedError` | [`src/utils/handlers/YTDLUtil.ts`](../src/utils/handlers/YTDLUtil.ts) | `Error` | bot detection playback error type | play/YTDL pipeline |
| `AgeRestrictedError` | [`src/utils/handlers/YTDLUtil.ts`](../src/utils/handlers/YTDLUtil.ts) | `Error` | age-restricted media error type | play/YTDL pipeline |
| `ExpiredDirectMediaError` | [`src/utils/handlers/YTDLUtil.ts`](../src/utils/handlers/YTDLUtil.ts) | `Error` | expired direct-media URL error type | play/YTDL pipeline |

## Command classes

All command classes extend `ContextCommand` and implement `contextRun(ctx)`.

### Developer
- `EvalCommand` ([`src/commands/developers/EvalCommand.ts`](../src/commands/developers/EvalCommand.ts))
- `LoginCommand` ([`src/commands/developers/LoginCommand.ts`](../src/commands/developers/LoginCommand.ts))
- `SetupCommand` ([`src/commands/developers/SetupCommand.ts`](../src/commands/developers/SetupCommand.ts))

### General
- `AboutCommand`, `HelpCommand`, `InviteCommand`, `LanguageCommand`, `PingCommand`, `PrefixCommand` in [`src/commands/general/`](../src/commands/general)

### Music
- `PlayCommand`, `SearchCommand`, `QueueCommand`, `NowPlayingCommand`, `PauseCommand`, `ResumeCommand`, `SkipCommand`, `SkipToCommand`, `StopCommand`, `RemoveCommand`, `SeekCommand`, `ShuffleCommand`, `RepeatCommand`, `VolumeCommand`, `FilterCommand`, `LyricsCommand`, `RequestChannelCommand`, `DJCommand`, `AutoPlayCommand`, `TwentyFourSevenCommand` in [`src/commands/music/`](../src/commands/music)

## Update policy

Keep this list synchronized with class declarations; update only changed entries.
