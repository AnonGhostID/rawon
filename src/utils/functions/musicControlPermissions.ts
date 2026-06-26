import { type Guild, type GuildMember, PermissionFlagsBits } from "discord.js";
import { type Rawon } from "../../structures/Rawon.js";
import { type QueueSong } from "../../typings/index.js";

type TrackSource = QueueSong | string | null | undefined;

type PermissionInput = {
    client: Rawon;
    guild: Guild;
    member: GuildMember | null | undefined;
    trackOwners?: Iterable<TrackSource>;
};

function isDJActive(client: Rawon, guild: Guild): boolean {
    return client.data.data?.[guild.id]?.dj?.enable === true;
}

function collectOwnerIds(sources: Iterable<TrackSource> = []): string[] {
    const ids: string[] = [];
    for (const s of sources) {
        if (typeof s === "string") {
            ids.push(s);
            continue;
        }
        const id = s?.requester.id;
        if (id) {
            ids.push(id);
        }
    }
    return ids;
}

function hasOtherHumans(member: GuildMember): boolean {
    const ch = member.voice.channel;
    if (!ch) {
        return true;
    }
    return ch.members.some((m) => !m.user.bot && m.id !== member.id);
}

async function isPrivileged({ client, guild, member }: PermissionInput): Promise<boolean> {
    if (!member) {
        return false;
    }
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return true;
    }
    const dj = await client.utils.fetchDJRole(guild).catch(() => null);
    return dj !== null && member.roles.cache.has(dj.id);
}

export async function canControlPlayback(input: PermissionInput): Promise<boolean> {
    const { member } = input;
    if (!member) {
        return false;
    }
    if (!isDJActive(input.client, input.guild)) {
        return true;
    }
    if (!hasOtherHumans(member)) {
        return true;
    }
    if (await isPrivileged(input)) {
        return true;
    }
    return collectOwnerIds(input.trackOwners).includes(member.id);
}

export { canControlPlayback as hasMusicControlPermission };

export async function canRemoveFromQueue(
    input: Omit<PermissionInput, "trackOwners"> & { tracks: QueueSong[] },
): Promise<boolean> {
    const { member, tracks } = input;
    if (!member) {
        return false;
    }
    if (!isDJActive(input.client, input.guild)) {
        return true;
    }
    if (!hasOtherHumans(member)) {
        return true;
    }
    if (await isPrivileged(input)) {
        return true;
    }
    return tracks.length > 0 && tracks.every((t) => t.requester.id === member.id);
}

export { canRemoveFromQueue as hasRemoveSelectionPermission };
