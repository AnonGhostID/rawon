import { type Guild, type GuildMember, type Snowflake } from "discord.js";
import { isMultiBot } from "../../config/env.js";
import { type CommandContext } from "../../structures/CommandContext.js";
import { type Rawon } from "../../structures/Rawon.js";

export const TARGET_KEY = "playbackTarget";

export const PLAYBACK_CMDS = new Set([
    "play",
    "p",
    "add",
    "search",
    "sc",
    "volume",
    "vol",
    "loop",
    "repeat",
    "shuffle",
    "autoplay",
    "ap",
    "filter",
    "skip",
    "s",
    "skipto",
    "st",
    "pause",
    "resume",
    "stop",
    "disconnect",
    "dc",
    "remove",
    "seek",
    "nowplaying",
    "np",
    "queue",
    "q",
    "lyrics",
    "ly",
    "lyric",
]);

export type PlaybackTarget = {
    client: Rawon;
    guild: Guild;
    member: GuildMember;
    voiceChannelId: Snowflake;
    isRemote: boolean;
    originGuildId: Snowflake | null;
    tokenIdx: number;
    hasActiveQueue: boolean;
    isPlaying: boolean;
};

type RankedTarget = PlaybackTarget & {
    botId: Snowflake;
};

export function isPlaybackCommand(name: string | null | undefined): boolean {
    return typeof name === "string" && PLAYBACK_CMDS.has(name.toLowerCase());
}

export function isPlaybackCmd(
    name: string | null | undefined,
    aliases: readonly string[] = [],
): boolean {
    return isPlaybackCommand(name) || aliases.some((a) => isPlaybackCommand(a));
}

export { isPlaybackCmd as isPlaybackMusicCommand };

export function shouldHandleMusicPrefix(client: Rawon, guild: Guild, isMention: boolean): boolean {
    if (!isMultiBot || isMention) {
        return true;
    }
    return client.multiBotManager.shouldRespond(client, guild);
}

export function getPlaybackTarget(ctx: CommandContext): PlaybackTarget | null {
    return (ctx.additionalArgs.get(TARGET_KEY) as PlaybackTarget | undefined) ?? null;
}

export function clonePlaybackTarget(from: CommandContext, to: CommandContext): void {
    const t = getPlaybackTarget(from);
    if (!t) {
        return;
    }
    attachPlaybackTarget(to, t);
}

export { clonePlaybackTarget as copyMusicCommandTarget };

export function encodeTargetSuffix(ctx: CommandContext): string {
    const t = getPlaybackTarget(ctx);
    const bid = t?.client.user?.id;
    if (!t || !bid) {
        return "";
    }
    return `_yes_${bid}_${t.guild.id}`;
}

export async function applyTargetByIds(
    ctx: CommandContext,
    botId: string | undefined,
    guildId: string | undefined,
): Promise<PlaybackTarget | null> {
    if (!botId || !guildId) {
        return null;
    }
    const origin = ctx.context.client as Rawon;
    const target =
        origin.multiBotManager.getBotById(botId)?.client ??
        (origin.user?.id === botId ? origin : null);
    const g = target?.guilds.cache.get(guildId) ?? null;
    if (!target || !g) {
        return null;
    }

    const m = await findVoiceMember(g, ctx.author.id);
    if (!m?.voice.channelId) {
        return null;
    }

    const tgt = buildTarget(target, g, m, m.voice.channelId, ctx.originGuild?.id ?? null);
    attachPlaybackTarget(ctx, tgt);
    return tgt;
}

export async function resolvePlaybackTarget(
    ctx: CommandContext,
    cmdName: string | null | undefined,
    aliases: readonly string[] = [],
): Promise<PlaybackTarget | null> {
    if (!isPlaybackCmd(cmdName, aliases)) {
        return null;
    }
    const t = await findBestTarget(
        ctx.context.client as Rawon,
        ctx.originGuild ?? null,
        ctx.author.id,
    );
    if (!t) {
        return null;
    }
    attachPlaybackTarget(ctx, t);
    return t;
}

function attachPlaybackTarget(ctx: CommandContext, target: PlaybackTarget): void {
    ctx.additionalArgs.set(TARGET_KEY, target);
    Object.defineProperty(ctx, "guild", {
        value: target.guild,
        writable: true,
        enumerable: true,
        configurable: true,
    });
}

async function findBestTarget(
    client: Rawon,
    originGuild: Guild | null,
    userId: Snowflake,
): Promise<PlaybackTarget | null> {
    const originId = originGuild?.id ?? null;
    const candidates = await gatherCandidates(client, originId, userId);
    if (candidates.length === 0) {
        return null;
    }
    candidates.sort((a, b) => rankCandidate(a, b, originId));
    return candidates[0] ?? null;
}

async function gatherCandidates(
    client: Rawon,
    originId: Snowflake | null,
    userId: Snowflake,
): Promise<RankedTarget[]> {
    const bots = isMultiBot ? client.multiBotManager.getBots() : [];
    const clients = bots.length > 0 ? bots.map((b) => b.client) : [client];
    const seen = new Set<string>();
    const voiceSeen = new Set<string>();
    const result: RankedTarget[] = [];

    for (const c of clients) {
        for (const g of c.guilds.cache.values()) {
            const m = await findVoiceMember(g, userId);
            const vc = m?.voice.channelId ?? null;
            if (!m || !vc) {
                continue;
            }

            const vKey = `${g.id}:${vc}`;
            if (voiceSeen.has(vKey)) {
                continue;
            }
            voiceSeen.add(vKey);

            const responsible = c.multiBotManager.getBotForVoiceChannel(g, vc) ?? c;
            const rg = responsible.guilds.cache.get(g.id);
            if (!rg) {
                continue;
            }

            const rm = await findVoiceMember(rg, userId);
            if (!rm?.voice.channelId) {
                continue;
            }

            const tgt = buildTarget(responsible, rg, rm, rm.voice.channelId, originId);
            const bid = responsible.user?.id ?? "unknown";
            const key = `${bid}:${rg.id}:${tgt.voiceChannelId}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            result.push({ ...tgt, botId: bid });
        }
    }

    return result;
}

async function findVoiceMember(guild: Guild, userId: Snowflake): Promise<GuildMember | null> {
    const vs = guild.voiceStates.cache.get(userId);
    const member = vs?.member ?? guild.members.cache.get(userId) ?? null;
    return member?.voice.channelId ? member : null;
}

function buildTarget(
    client: Rawon,
    guild: Guild,
    member: GuildMember,
    voiceChannelId: Snowflake,
    originGuildId: Snowflake | null,
): PlaybackTarget {
    const queueVc = guild.queue?.connection?.joinConfig.channelId ?? null;
    const hasActive = queueVc === voiceChannelId;
    const tokenIdx = client.multiBotManager.getBotByClient(client)?.tokenIndex ?? 0;

    return {
        client,
        guild,
        member,
        voiceChannelId,
        isRemote: originGuildId !== null && guild.id !== originGuildId,
        originGuildId,
        tokenIdx,
        hasActiveQueue: hasActive,
        isPlaying: hasActive && guild.queue?.playing === true,
    };
}

function rankCandidate(a: RankedTarget, b: RankedTarget, originId: Snowflake | null): number {
    const aOrigin = originId !== null && a.guild.id === originId;
    const bOrigin = originId !== null && b.guild.id === originId;
    if (aOrigin !== bOrigin) {
        return aOrigin ? -1 : 1;
    }
    if (a.isPlaying !== b.isPlaying) {
        return a.isPlaying ? -1 : 1;
    }
    if (a.hasActiveQueue !== b.hasActiveQueue) {
        return a.hasActiveQueue ? -1 : 1;
    }
    if (a.tokenIdx !== b.tokenIdx) {
        return a.tokenIdx - b.tokenIdx;
    }
    const cmp = a.guild.id.localeCompare(b.guild.id);
    if (cmp !== 0) {
        return cmp;
    }
    return a.botId.localeCompare(b.botId);
}
