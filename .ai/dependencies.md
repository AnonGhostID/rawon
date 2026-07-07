# Dependencies

Cross-ref: [`repo-map.md`](./repo-map.md), [`architecture.md`](./architecture.md)

## Internal modules (high-level)

- `config` -> env parsing + client options
- `structures` -> core client/context/queue
- `listeners` -> event ingress and routing
- `commands` -> user interaction surface
- `utils/functions` -> formatting/permissions/i18n helpers
- `utils/handlers` -> media provider + playback pipeline
- `utils/structures` -> DB/cache/multibot/request channel/login infra

## External libraries

From [`package.json`](../package.json):

### Core runtime
- `discord.js`, `@sapphire/framework`, `@sapphire/decorators`, `@stegripe/command-context`

### Audio/media
- `@discordjs/voice`, `prism-media`, `ffmpeg-static`, `youtubei`, `soundcloud.ts`, `opusscript`, `tweetnacl`

### Storage/network
- `better-sqlite3`, `@libsql/client`, `got`, `dotenv`

### Login/browser automation
- `puppeteer`, `puppeteer-core`, `@puppeteer/browsers`

### Logging and utilities
- `pino`, `pino-pretty`, `i18n`, `date-fns`, `tslib`, `zip-lib`

### Build/dev
- `@swc/cli`, `@swc/core`, `typescript`, `@biomejs/biome`, `rimraf`

## Potential unused dependencies

Tool run: `pnpm dlx depcheck --skip-missing=true`.

Reported unused (verify manually before removal):
- Runtime: `@sapphire/utilities`, `tslib`, `tweetnacl`, `zip-lib`
- Dev: `@stegripe/biomejs-config`, `rimraf`

Notes:
- `depcheck` can produce false positives for dynamic imports, optional runtime paths, and transitive usage.

## Circular dependencies

Tool run: `pnpm dlx madge --extensions ts --circular src`.

Result: **36 circular dependencies**.

Dominant cycle roots:
- `typings/index.d.ts <-> structures/CommandContext.ts <-> structures/Rawon.ts`
- `structures/Rawon.ts <-> utils/structures/*` (AudioCacheManager, RequestChannelManager, MultiBotManager)
- `structures/ServerQueue.ts <-> utils/handlers/GeneralUtil.ts` chains
- `config/index.ts <-> config/env.ts <-> typings/index.d.ts`

Impact:
- raises coupling and load-order complexity
- increases refactor risk and type/import churn

## Dependency graph pointers

- Provider adapters: [`src/utils/handlers/`](../src/utils/handlers)
- Infra managers: [`src/utils/structures/`](../src/utils/structures)
- Primary import concentration: [`src/structures/Rawon.ts`](../src/structures/Rawon.ts), [`src/structures/ServerQueue.ts`](../src/structures/ServerQueue.ts)

## Update policy

Refresh this file when package.json changes or cycle analysis changes.
