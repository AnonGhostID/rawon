# Repository Map

Source of truth: [`README.md`](../README.md), [`package.json`](../package.json), [`src/index.ts`](../src/index.ts)

## Folder tree (major)

```text
.
├── src/
│   ├── commands/
│   │   ├── developers/
│   │   ├── general/
│   │   └── music/
│   ├── listeners/
│   ├── structures/
│   ├── utils/
│   │   ├── decorators/
│   │   ├── functions/
│   │   ├── handlers/
│   │   ├── structures/
│   │   └── yt-dlp/
│   ├── config/
│   ├── preconditions/
│   ├── typings/
│   ├── bot.ts
│   └── index.ts
├── lang/
├── docs/
├── .github/workflows/
├── index.js
├── ServerQueue_upstream.ts
├── tsconfig.json
├── biome.json
├── .swcrc
├── Dockerfile
├── compose.yml
└── ecosystem.config.cjs
```

## Purpose of major directories

- [`src/commands/`](../src/commands): user-facing command handlers (developer/general/music).
- [`src/listeners/`](../src/listeners): Discord event listeners (message, interaction, ready, voice, lifecycle).
- [`src/structures/`](../src/structures): core runtime objects (`Rawon`, `ServerQueue`, `CommandContext`).
- [`src/utils/handlers/`](../src/utils/handlers): playback/search/provider integration (YouTube/SoundCloud/Spotify/yt-dlp).
- [`src/utils/structures/`](../src/utils/structures): infrastructure managers (DB, cache, request-channel UI, multibot, login).
- [`src/config/`](../src/config): environment/config parsing and client options.
- [`lang/`](../lang): i18n locale JSON files.
- [`docs/`](../docs): user/operator docs (cookies/disclaimers).

## Important entrypoints

- [`src/index.ts`](../src/index.ts): startup mode switch (single bot, multibot launcher, or sharding).
- [`src/bot.ts`](../src/bot.ts): single-process client boot and graceful shutdown.
- [`src/structures/Rawon.ts`](../src/structures/Rawon.ts): main client class; wires data/cache/services.
- [`index.js`](../index.js): production bootstrap (ffmpeg/yt-dlp checks, loads `dist/index.js`).

## Important config files

- [`package.json`](../package.json): scripts, runtime/development deps.
- [`tsconfig.json`](../tsconfig.json): TS target/module/paths.
- [`.swcrc`](../.swcrc): SWC compile settings.
- [`biome.json`](../biome.json): lint/format rules.
- [`.env.example`](../.env.example), [`dev.env.example`](../dev.env.example): runtime config template.
- [`compose.yml`](../compose.yml), [`Dockerfile`](../Dockerfile), [`ecosystem.config.cjs`](../ecosystem.config.cjs): deploy/runtime process config.

## Build system

- Package manager: `pnpm`
- Compile: SWC (`pnpm run build`, `pnpm run build:vm`)
- Type check: `tsc` (`pnpm run tscompile`)
- Lint/format: Biome (`pnpm run lint`, `pnpm run lint:fix`)

## Frameworks / platforms used

- Discord bot framework: `discord.js`, `@sapphire/framework`, `@sapphire/decorators`
- Voice/audio: `@discordjs/voice`, `prism-media`, `ffmpeg-static`, `yt-dlp`
- Providers: `youtubei`, `soundcloud.ts`, Spotify Web API
- Storage: `better-sqlite3` (local), `@libsql/client` Turso/libSQL (remote)
- Browser auth automation: `puppeteer-core`, `@puppeteer/browsers`

## Update policy

When code changes, update only impacted sections in this file and keep existing human notes intact.
