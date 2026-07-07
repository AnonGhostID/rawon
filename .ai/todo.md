# Technical TODO Index

Cross-ref: [`dependencies.md`](./dependencies.md), [`architecture.md`](./architecture.md)

## Technical debt

- **High coupling / circular imports**: 36 cycles (see [`dependencies.md`](./dependencies.md)); prioritize breaking `Rawon`/`typings`/`ServerQueue` cycles.
- **Large monolithic listeners**:
  - [`InteractionCreateListener.ts`](../src/listeners/InteractionCreateListener.ts)
  - [`MessageCreateListener.ts`](../src/listeners/MessageCreateListener.ts)
  split routing, permission, and command execution concerns.
- **Large queue orchestrator**:
  - [`ServerQueue.ts`](../src/structures/ServerQueue.ts) holds too many responsibilities (state machine, persistence, voice status, autoplay, cache strategy).

## Duplicated code

- Repeated multibot member/voice resolution logic in message + interaction listeners.
- Repeated request-channel permission fallback message construction in `RequestChannelManager`.
- Similar error-message/autodelete patterns repeated across command handlers.

## Dead code / potentially unused

- `depcheck` reports possible unused deps (verify): `@sapphire/utilities`, `tslib`, `tweetnacl`, `zip-lib`, `@stegripe/biomejs-config`, `rimraf`.
- Legacy loaders/utilities (`CommandManager`, `EventsLoader`, `JSONDataManager`) should be validated against current runtime paths.

## Large files / complexity hotspots

Top large TS hotspots:
- [`src/listeners/InteractionCreateListener.ts`](../src/listeners/InteractionCreateListener.ts)
- [`src/structures/ServerQueue.ts`](../src/structures/ServerQueue.ts)
- [`src/utils/structures/GoogleLoginManager.ts`](../src/utils/structures/GoogleLoginManager.ts)
- [`src/utils/structures/RequestChannelManager.ts`](../src/utils/structures/RequestChannelManager.ts)
- [`src/listeners/MessageCreateListener.ts`](../src/listeners/MessageCreateListener.ts)
- [`src/listeners/ReadyListener.ts`](../src/listeners/ReadyListener.ts)

## Risky areas

- Multi-bot ownership/race conditions (queue ownership, request-channel message ownership).
- Recovery path complexity in playback (`play` + `ServerQueue` idle transitions + cache/seek behavior).
- Google login browser automation and cookie validity lifecycle.
- Queue restore at startup in partially ready guild/channel states.

## Optimization opportunities

- Extract shared multibot routing service used by message + interaction listeners.
- Isolate queue persistence adapter from `ServerQueue` domain logic.
- Introduce explicit state transition logging schema for queue lifecycle.
- Reduce repeated API calls/member fetches in hot listener paths with short-lived caches.

## Existing quality issues (current baseline)

`pnpm run lint` currently fails on repository baseline (before these docs), including:
- formatting issues in some command files
- unused import in `ServerQueue.ts`
- style issues in listener/command files

Fixing these in separate focused cleanup PR is recommended.

## Update policy

When code changes, update only affected TODO bullets; do not remove manual notes unless resolved.
