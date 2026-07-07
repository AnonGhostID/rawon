# API Surface

This repository has **no HTTP REST server endpoints**. External interface is Discord events + commands.

Cross-ref: [`architecture.md`](./architecture.md), [`functions.md`](./functions.md), [`database.md`](./database.md)

## Event ingress endpoints

| Method | Path | Middleware/guards | Request | Response | Controller | Service | DB usage |
|---|---|---|---|---|---|---|---|
| EVENT | `discord:messageCreate` | bot/DM/ready checks, multibot routing, request-channel rules | `Message` | message replies/command execution | [`MessageCreateListener.run`](../src/listeners/MessageCreateListener.ts) | command compatibility + music handlers | reads/writes queue/player/request-channel state |
| EVENT | `discord:interactionCreate` | guild-ready check, cooldowns, dev-only, multibot routing | `Interaction` | deferred/reply/edit responses | [`InteractionCreateListener.run`](../src/listeners/InteractionCreateListener.ts) | command handlers + request-channel button actions | reads/writes queue/player/request-channel state |
| EVENT | `discord:voiceStateUpdate` | queue/guild presence checks | `VoiceState(old,new)` | pause/resume/destroy queue and notify | [`VoiceStateUpdateListener.run`](../src/listeners/VoiceStateUpdateListener.ts) | ServerQueue | updates queue/player state |

## Command endpoints (chat input + prefix)

Conventions:
- Method: `COMMAND`
- Path format: `/command/<name>`
- Middleware column includes notable preconditions.

### Developer

| Method | Path | Middleware | Request | Response | Controller | Service | DB usage |
|---|---|---|---|---|---|---|---|
| COMMAND | `/command/eval` | `DevOnly` | code payload | eval output/error | [`EvalCommand`](../src/commands/developers/EvalCommand.ts) | runtime eval helpers | none |
| COMMAND | `/command/login` (`start/status/logout`) | `DevOnly` | subcommand | login status/session messages | [`LoginCommand`](../src/commands/developers/LoginCommand.ts) | `CookiesManager`/`GoogleLoginManager` | login session persisted in `login_session` |
| COMMAND | `/command/setup` | developer-only behavior in command | setting/value | setting updated/view response | [`SetupCommand`](../src/commands/developers/SetupCommand.ts) | `SQLiteDataManager` | writes `bot_settings` |

### General

| Method | Path | Middleware | Request | Response | Controller | Service | DB usage |
|---|---|---|---|---|---|---|---|
| COMMAND | `/command/about` | standard command checks | none | bot stats/info embed | [`AboutCommand`](../src/commands/general/AboutCommand.ts) | `ClientUtils` | reads counts/config |
| COMMAND | `/command/help` | standard command checks | command/category | paginated help | [`HelpCommand`](../src/commands/general/HelpCommand.ts) | command registry + pagination | none |
| COMMAND | `/command/invite` | standard command checks | none | invite links | [`InviteCommand`](../src/commands/general/InviteCommand.ts) | discord app metadata | none |
| COMMAND | `/command/language` | standard command checks | locale code | language set/status | [`LanguageCommand`](../src/commands/general/LanguageCommand.ts) | i18n helpers | updates guild locale in `guilds` |
| COMMAND | `/command/ping` | standard command checks | none | latency health embed | [`PingCommand`](../src/commands/general/PingCommand.ts) | ws/api timing | none |
| COMMAND | `/command/prefix` | standard command checks | new prefix/reset | confirmation | [`PrefixCommand`](../src/commands/general/PrefixCommand.ts) | `SQLiteDataManager.setPrefix` | updates `guilds.prefix` |

### Music

| Method | Path | Middleware | Request | Response | Controller | Service | DB usage |
|---|---|---|---|---|---|---|---|
| COMMAND | `/command/play` | voice + permissions + multibot routing | query/url | queue add/start | [`PlayCommand`](../src/commands/music/PlayCommand.ts) | `searchTrack`, `handleVideos`, `play` | queue/player state read/write |
| COMMAND | `/command/search` | voice + routing | query + source | selectable results/add | [`SearchCommand`](../src/commands/music/SearchCommand.ts) | `searchTrack`, pagination | queue state write |
| COMMAND | `/command/queue` | voice/queue guards | show/clear | queue embed or clear result | [`QueueCommand`](../src/commands/music/QueueCommand.ts) | queue inspection | queue state write on clear |
| COMMAND | `/command/nowplaying` | queue exists | none | now-playing embed | [`NowPlayingCommand`](../src/commands/music/NowPlayingCommand.ts) | queue/player state | none |
| COMMAND | `/command/pause` | queue + control perms | none | paused message | [`PauseCommand`](../src/commands/music/PauseCommand.ts) | `ServerQueue.player.pause` | player state persists |
| COMMAND | `/command/resume` | queue + control perms | none | resumed message | [`ResumeCommand`](../src/commands/music/ResumeCommand.ts) | `ServerQueue.player.unpause` | player state persists |
| COMMAND | `/command/skip` | queue + vote/control checks | none | skipped status | [`SkipCommand`](../src/commands/music/SkipCommand.ts) | queue skip logic | queue state updates |
| COMMAND | `/command/skipto` | queue + control checks | index | jump to song | [`SkipToCommand`](../src/commands/music/SkipToCommand.ts) | queue ordering + play | queue state updates |
| COMMAND | `/command/stop` | queue exists | none | queue destroyed | [`StopCommand`](../src/commands/music/StopCommand.ts) | `ServerQueue.destroy` | queue state delete |
| COMMAND | `/command/remove` | queue exists | index | song removed | [`RemoveCommand`](../src/commands/music/RemoveCommand.ts) | queue manipulation | queue state write |
| COMMAND | `/command/seek` | queue exists | timestamp | seek/restart playback | [`SeekCommand`](../src/commands/music/SeekCommand.ts) | `play` with seek, cache wait | queue position write |
| COMMAND | `/command/shuffle` | queue exists | on/off/toggle | shuffle mode response | [`ShuffleCommand`](../src/commands/music/ShuffleCommand.ts) | `ServerQueue.setShuffle` | player state write |
| COMMAND | `/command/repeat` | queue exists | off/song/queue | loop mode response | [`RepeatCommand`](../src/commands/music/RepeatCommand.ts) | `ServerQueue.setLoopMode` | player state write |
| COMMAND | `/command/volume` | queue exists | value | volume update | [`VolumeCommand`](../src/commands/music/VolumeCommand.ts) | `ServerQueue.volume` | player state write |
| COMMAND | `/command/filter` | queue exists | filter toggles | filter update/restart | [`FilterCommand`](../src/commands/music/FilterCommand.ts) | ffmpeg filter toggles | player state write |
| COMMAND | `/command/lyrics` | queue/song context | query/current song | lyrics embed/page | [`LyricsCommand`](../src/commands/music/LyricsCommand.ts) | lyrics API (`stegripeApiUrl`) | none |
| COMMAND | `/command/requestchannel` | manage channel permissions | set/disable | panel creation/deletion | [`RequestChannelCommand`](../src/commands/music/RequestChannelCommand.ts) | `RequestChannelManager` | request_channel + message id write |
| COMMAND | `/command/dj` | role/config permissions | enable/disable/role | DJ mode update | [`DJCommand`](../src/commands/music/DJCommand.ts) | guild DJ config | writes `guilds.dj_*` |
| COMMAND | `/command/autoplay` | queue exists | enable/disable | autoplay state response | [`AutoPlayCommand`](../src/commands/music/AutoPlayCommand.ts) | `ServerQueue.setAutoPlay` | player state write |
| COMMAND | `/command/247` | queue exists | enable/disable | stay-in-channel state | [`247Command`](../src/commands/music/247Command.ts) | `ServerQueue.setStayInChannel` | player state write |

## Request channel button endpoints

| Method | Path | Middleware | Request | Response | Controller | Service | DB usage |
|---|---|---|---|---|---|---|---|
| BUTTON | `RC_PAUSE_RESUME`,`RC_SKIP`,`RC_STOP`,`RC_LOOP`,`RC_SHUFFLE`,`RC_VOL_DOWN`,`RC_VOL_UP`,`RC_REMOVE`,`RC_AUTOPLAY`,`RC_LYRICS` | interaction author/voice/routing checks | `ButtonInteraction` | updated queue + panel | [`InteractionCreateListener.handleRequestChannelButton`](../src/listeners/InteractionCreateListener.ts) | `RequestChannelManager` + queue methods | queue/player/request-channel updates |

## Update policy

Add/remove command rows as command files change; keep route semantics concise.
