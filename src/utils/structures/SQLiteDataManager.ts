import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { type BotSettings, type GuildData, type LoopMode } from "../../typings/index.js";
import { createBackend, type DatabaseBackend } from "./DatabaseBackend.js";
import { OperationManager } from "./OperationManager.js";

export const BOT_SETTINGS_DEFAULTS: BotSettings = {
    embedColor: "22C9FF",
    yesEmoji: "✅",
    noEmoji: "❌",
    altPrefix: ["{mention}"],
    requestChannelSplash: "https://cdn.stegripe.org/images/rawon_splash.png",
    defaultVolume: 100,
    musicSelectionType: "message",
    enableAudioCache: true,
};

export class SQLiteDataManager<T extends Record<string, GuildData> = Record<string, GuildData>> {
    private readonly db: DatabaseBackend;
    private readonly manager = new OperationManager();
    private _data: T | null = null;

    public constructor(public readonly dbPath: string) {
        this.ensureDirectory();
        this.db = createBackend(this.dbPath);
    }

    private ensureDirectory(): void {
        const dir = path.dirname(this.dbPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }

    private async initSchema(): Promise<void> {
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS guilds (
                guild_id TEXT PRIMARY KEY,
                locale TEXT,
                dj_enable INTEGER DEFAULT 0,
                dj_role TEXT
            )
        `);

        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS request_channels (
                guild_id TEXT NOT NULL,
                bot_id TEXT NOT NULL,
                channel_id TEXT,
                message_id TEXT,
                PRIMARY KEY (guild_id, bot_id),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `);

        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS player_states (
                guild_id TEXT NOT NULL,
                bot_id TEXT NOT NULL,
                loop_mode TEXT DEFAULT 'OFF',
                shuffle INTEGER DEFAULT 0,
                autoplay INTEGER DEFAULT 0,
                volume INTEGER DEFAULT 100,
                filters_json TEXT DEFAULT '{}',
                PRIMARY KEY (guild_id, bot_id),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `);

        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS queue_states (
                guild_id TEXT NOT NULL,
                bot_id TEXT NOT NULL,
                text_channel_id TEXT NOT NULL,
                voice_channel_id TEXT NOT NULL,
                songs_json TEXT NOT NULL,
                current_song_key TEXT,
                current_position INTEGER DEFAULT 0,
                PRIMARY KEY (guild_id, bot_id),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `);

        await this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_queue_states_guild ON queue_states(guild_id);
            CREATE INDEX IF NOT EXISTS idx_queue_states_bot ON queue_states(bot_id);
            CREATE INDEX IF NOT EXISTS idx_player_states_guild ON player_states(guild_id);
            CREATE INDEX IF NOT EXISTS idx_player_states_bot ON player_states(bot_id);
            CREATE INDEX IF NOT EXISTS idx_request_channels_guild ON request_channels(guild_id);
            CREATE INDEX IF NOT EXISTS idx_request_channels_bot ON request_channels(bot_id);
        `);

        const tableInfo = await this.db.pragmaAll<{
            cid: number;
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
        }>("PRAGMA table_info(guilds)");

        const hasPrefixColumn = tableInfo.some((col) => col.name === "prefix");
        if (!hasPrefixColumn) {
            await this.db.exec(`
                ALTER TABLE guilds ADD COLUMN prefix TEXT DEFAULT '';
            `);
        }

        const playerStateInfo = await this.db.pragmaAll<{
            cid: number;
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
        }>("PRAGMA table_info(player_states)");

        const hasAutoplayColumn = playerStateInfo.some((col) => col.name === "autoplay");
        if (!hasAutoplayColumn) {
            await this.db.exec(`
                ALTER TABLE player_states ADD COLUMN autoplay INTEGER DEFAULT 0;
            `);
        }

        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS bot_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                embed_color TEXT,
                yes_emoji TEXT,
                no_emoji TEXT,
                alt_prefix TEXT,
                request_channel_splash TEXT,
                default_volume INTEGER,
                music_selection_type TEXT,
                enable_audio_cache INTEGER
            )
        `);

        await this.db.exec(`
            INSERT OR IGNORE INTO bot_settings (id) VALUES (1)
        `);
    }

    public get data(): T | null {
        return this._data;
    }

    public async load(): Promise<T | null> {
        try {
            await this.manager.add(async () => {
                const guilds = await this.db.all<{
                    guild_id: string;
                    locale: string | null;
                    dj_enable: number;
                    dj_role: string | null;
                    prefix: string | null;
                }>("SELECT * FROM guilds");

                const requestChannels = await this.db.all<{
                    guild_id: string;
                    channel_id: string | null;
                    message_id: string | null;
                }>("SELECT * FROM request_channels");

                const playerStates = await this.db.all<{
                    guild_id: string;
                    loop_mode: string;
                    shuffle: number;
                    autoplay: number;
                    volume: number;
                    filters_json: string | null;
                }>("SELECT * FROM player_states");

                const queueStates = await this.db.all<{
                    guild_id: string;
                    text_channel_id: string;
                    voice_channel_id: string;
                    songs_json: string;
                    current_song_key: string | null;
                    current_position: number;
                }>("SELECT * FROM queue_states");

                const data: Record<string, GuildData> = {};

                for (const guild of guilds) {
                    data[guild.guild_id] = {
                        locale: guild.locale ?? undefined,
                        prefix: guild.prefix ?? undefined,
                        dj:
                            guild.dj_enable !== 0 || guild.dj_role !== null
                                ? {
                                      enable: guild.dj_enable === 1,
                                      role: guild.dj_role,
                                  }
                                : undefined,
                    };
                }

                const requestChannelsByGuild = new Map<
                    string,
                    { channel_id: string | null; message_id: string | null }
                >();
                for (const rc of requestChannels) {
                    if (!requestChannelsByGuild.has(rc.guild_id)) {
                        requestChannelsByGuild.set(rc.guild_id, {
                            channel_id: rc.channel_id,
                            message_id: rc.message_id,
                        });
                    }
                }

                for (const [guildId, rc] of requestChannelsByGuild.entries()) {
                    if (!data[guildId]) {
                        data[guildId] = {};
                    }
                    data[guildId].requestChannel = {
                        channelId: rc.channel_id,
                        messageId: rc.message_id,
                    };
                }

                for (const ps of playerStates) {
                    if (!data[ps.guild_id]) {
                        data[ps.guild_id] = {};
                    }
                    let filters: Record<string, boolean> = {};
                    if (ps.filters_json) {
                        try {
                            filters = JSON.parse(ps.filters_json) as Record<string, boolean>;
                        } catch {
                            filters = {};
                        }
                    }
                    data[ps.guild_id].playerState = {
                        loopMode: (ps.loop_mode ?? "OFF") as LoopMode,
                        shuffle: ps.shuffle === 1,
                        autoplay: ps.autoplay === 1,
                        volume: ps.volume ?? this.botSettings.defaultVolume,
                        filters,
                    };
                }

                for (const qs of queueStates) {
                    if (!data[qs.guild_id]) {
                        data[qs.guild_id] = {};
                    }
                    data[qs.guild_id].queueState = {
                        textChannelId: qs.text_channel_id,
                        voiceChannelId: qs.voice_channel_id,
                        songs: JSON.parse(qs.songs_json),
                        currentSongKey: qs.current_song_key,
                        currentPosition: qs.current_position,
                    };
                }

                this._data = data as T;
            });

            return this._data;
        } catch (error) {
            console.error("Failed to load data from SQLite:", error);
            return this.data;
        }
    }

    public async save(data: () => T): Promise<T | null> {
        await this.manager.add(async () => {
            const dat = data();

            const statements: { sql: string; params: (string | number | null)[] }[] = [];
            for (const [guildId, guildData] of Object.entries(dat) as [string, GuildData][]) {
                statements.push({
                    sql: `
                        INSERT INTO guilds (guild_id, locale, dj_enable, dj_role, prefix)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(guild_id) DO UPDATE SET
                            locale = excluded.locale,
                            dj_enable = excluded.dj_enable,
                            dj_role = excluded.dj_role,
                            prefix = excluded.prefix
                    `,
                    params: [
                        guildId,
                        guildData.locale ?? null,
                        guildData.dj?.enable ? 1 : 0,
                        guildData.dj?.role ?? null,
                        guildData.prefix ?? null,
                    ] as (string | number | null)[],
                });
            }

            await this.db.transaction(statements);
        });

        return this.load() as Promise<T | null>;
    }

    public getGuildIdsWithQueueState(_botId: string): string[] {
        if (!this._data) {
            return [];
        }
        return Object.entries(this._data)
            .filter(([, gd]) => gd?.queueState != null)
            .map(([gid]) => gid);
    }

    public getQueueState(guildId: string, _botId: string): GuildData["queueState"] | null {
        return this._data?.[guildId]?.queueState ?? null;
    }

    public async saveQueueState(
        guildId: string,
        botId: string,
        queueState: GuildData["queueState"],
    ): Promise<void> {
        if (!queueState) {
            return;
        }

        await this.manager.add(async () => {
            await this.db.run(
                `
                INSERT INTO guilds (guild_id, locale, dj_enable, dj_role, prefix)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(guild_id) DO NOTHING
                `,
                guildId,
                null,
                0,
                null,
                null,
            );

            await this.db.run(
                `
                INSERT INTO queue_states (guild_id, bot_id, text_channel_id, voice_channel_id, songs_json, current_song_key, current_position)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(guild_id, bot_id) DO UPDATE SET
                    text_channel_id = excluded.text_channel_id,
                    voice_channel_id = excluded.voice_channel_id,
                    songs_json = excluded.songs_json,
                    current_song_key = excluded.current_song_key,
                    current_position = excluded.current_position
                `,
                guildId,
                botId,
                queueState.textChannelId,
                queueState.voiceChannelId,
                JSON.stringify(queueState.songs),
                queueState.currentSongKey ?? null,
                queueState.currentPosition ?? 0,
            );

            if (!this._data) {
                this._data = {} as T;
            }
            const data = this._data as Record<string, GuildData>;
            if (!data[guildId]) {
                data[guildId] = {};
            }
            data[guildId].queueState = queueState;
        });
    }

    public async deleteQueueState(guildId: string, botId: string): Promise<void> {
        await this.manager.add(async () => {
            await this.db.run(
                "DELETE FROM queue_states WHERE guild_id = ? AND bot_id = ?",
                guildId,
                botId,
            );

            if (this._data?.[guildId]) {
                this._data[guildId].queueState = undefined;
            }
        });
    }

    public getPlayerState(guildId: string, _botId: string): GuildData["playerState"] | null {
        return this._data?.[guildId]?.playerState ?? null;
    }

    public async savePlayerState(
        guildId: string,
        botId: string,
        playerState: GuildData["playerState"],
    ): Promise<void> {
        if (!playerState) {
            return;
        }

        await this.manager.add(async () => {
            await this.db.run(
                `
                INSERT INTO guilds (guild_id, locale, dj_enable, dj_role, prefix)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(guild_id) DO NOTHING
                `,
                guildId,
                null,
                0,
                null,
                null,
            );

            await this.db.run(
                `
                INSERT INTO player_states (guild_id, bot_id, loop_mode, shuffle, autoplay, volume, filters_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(guild_id, bot_id) DO UPDATE SET
                    loop_mode = excluded.loop_mode,
                    shuffle = excluded.shuffle,
                    autoplay = excluded.autoplay,
                    volume = excluded.volume,
                    filters_json = excluded.filters_json
                `,
                guildId,
                botId,
                playerState.loopMode,
                playerState.shuffle ? 1 : 0,
                playerState.autoplay ? 1 : 0,
                playerState.volume,
                JSON.stringify(playerState.filters),
            );

            if (!this._data) {
                this._data = {} as T;
            }
            const data = this._data as Record<string, GuildData>;
            if (!data[guildId]) {
                data[guildId] = {};
            }
            data[guildId].playerState = playerState;
        });
    }

    public async deletePlayerState(guildId: string, botId: string): Promise<void> {
        await this.manager.add(async () => {
            await this.db.run(
                "DELETE FROM player_states WHERE guild_id = ? AND bot_id = ?",
                guildId,
                botId,
            );

            if (this._data?.[guildId]) {
                this._data[guildId].playerState = undefined;
            }
        });
    }

    public getRequestChannel(
        guildId: string,
        _botId: string,
    ): { channelId: string | null; messageId: string | null } | null {
        return this._data?.[guildId]?.requestChannel ?? null;
    }

    public async saveRequestChannel(
        guildId: string,
        botId: string,
        channelId: string | null,
        messageId: string | null,
    ): Promise<void> {
        await this.manager.add(async () => {
            await this.db.run(
                `
                INSERT INTO guilds (guild_id, locale, dj_enable, dj_role, prefix)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(guild_id) DO NOTHING
                `,
                guildId,
                null,
                0,
                null,
                null,
            );

            await this.db.run(
                `
                INSERT INTO request_channels (guild_id, bot_id, channel_id, message_id)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(guild_id, bot_id) DO UPDATE SET
                    channel_id = excluded.channel_id,
                    message_id = excluded.message_id
                `,
                guildId,
                botId,
                channelId,
                messageId,
            );

            if (!this._data) {
                this._data = {} as T;
            }
            const data = this._data as Record<string, GuildData>;
            if (!data[guildId]) {
                data[guildId] = {};
            }
            data[guildId].requestChannel = { channelId, messageId };
        });
    }

    public async deleteRequestChannel(guildId: string, botId: string): Promise<void> {
        await this.manager.add(async () => {
            await this.db.run(
                "DELETE FROM request_channels WHERE guild_id = ? AND bot_id = ?",
                guildId,
                botId,
            );

            if (this._data?.[guildId]) {
                this._data[guildId].requestChannel = undefined;
            }
        });
    }

    public getAllGuildIds(): string[] {
        if (!this._data) {
            return [];
        }
        return Object.keys(this._data);
    }

    public getPrefix(guildId: string): string | null {
        return this._data?.[guildId]?.prefix ?? null;
    }

    public async setPrefix(guildId: string, prefix: string | null): Promise<void> {
        await this.manager.add(async () => {
            const changes = await this.db.run(
                `
                UPDATE guilds SET prefix = ? WHERE guild_id = ?
                `,
                prefix,
                guildId,
            );

            if (changes === 0) {
                await this.db.run(
                    `
                    INSERT INTO guilds (guild_id, locale, dj_enable, dj_role, prefix)
                    VALUES (?, ?, ?, ?, ?)
                    `,
                    guildId,
                    null,
                    0,
                    null,
                    prefix,
                );
            }

            if (!this._data) {
                this._data = {} as T;
            }
            const data = this._data as Record<string, GuildData>;
            if (!data[guildId]) {
                data[guildId] = {};
            }
            if (prefix === null) {
                delete data[guildId].prefix;
            } else {
                data[guildId].prefix = prefix;
            }
        });
    }

    public async deleteGuildData(guildId: string): Promise<void> {
        await this.manager.add(async () => {
            await this.db.run("DELETE FROM guilds WHERE guild_id = ?", guildId);

            if (this._data) {
                delete this._data[guildId];
            }
        });
    }

    private _botSettings: BotSettings = { ...BOT_SETTINGS_DEFAULTS };

    public get botSettings(): BotSettings {
        return this._botSettings;
    }

    private async loadBotSettings(): Promise<void> {
        const row = await this.db.get<{
            embed_color: string | null;
            yes_emoji: string | null;
            no_emoji: string | null;
            alt_prefix: string | null;
            request_channel_splash: string | null;
            default_volume: number | null;
            music_selection_type: string | null;
            enable_audio_cache: number | null;
        }>("SELECT * FROM bot_settings WHERE id = 1");

        if (!row) {
            this._botSettings = { ...BOT_SETTINGS_DEFAULTS };
            return;
        }

        this._botSettings = {
            embedColor: row.embed_color ?? BOT_SETTINGS_DEFAULTS.embedColor,
            yesEmoji: row.yes_emoji ?? BOT_SETTINGS_DEFAULTS.yesEmoji,
            noEmoji: row.no_emoji ?? BOT_SETTINGS_DEFAULTS.noEmoji,
            altPrefix: row.alt_prefix
                ? row.alt_prefix
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                : [...BOT_SETTINGS_DEFAULTS.altPrefix],
            requestChannelSplash:
                row.request_channel_splash ?? BOT_SETTINGS_DEFAULTS.requestChannelSplash,
            defaultVolume: row.default_volume ?? BOT_SETTINGS_DEFAULTS.defaultVolume,
            musicSelectionType:
                row.music_selection_type ?? BOT_SETTINGS_DEFAULTS.musicSelectionType,
            enableAudioCache:
                row.enable_audio_cache === null
                    ? BOT_SETTINGS_DEFAULTS.enableAudioCache
                    : row.enable_audio_cache === 1,
        };
    }

    public async setBotSetting(key: string, value: string | number | null): Promise<void> {
        const validColumns = new Set([
            "embed_color",
            "yes_emoji",
            "no_emoji",
            "alt_prefix",
            "request_channel_splash",
            "default_volume",
            "music_selection_type",
            "enable_audio_cache",
        ]);

        if (!validColumns.has(key)) {
            throw new Error(`Invalid setting key: ${key}`);
        }

        await this.manager.add(async () => {
            await this.db.run(`UPDATE bot_settings SET ${key} = ? WHERE id = 1`, value);
            if (key === "yes_emoji") {
                this._botSettings.yesEmoji = (value as string) ?? BOT_SETTINGS_DEFAULTS.yesEmoji;
            } else if (key === "no_emoji") {
                this._botSettings.noEmoji = (value as string) ?? BOT_SETTINGS_DEFAULTS.noEmoji;
            }
            await this.loadBotSettings();
        });
    }

    public async init(): Promise<void> {
        await this.initSchema();
        await this.loadBotSettings();
        await this.load();
    }

    public close(): void {
        this.db.close();
    }
}
