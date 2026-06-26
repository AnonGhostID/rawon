import { type Guild, type GuildMember } from "discord.js";
import { type Rawon } from "../../structures/Rawon.js";
import { type Song } from "../../typings/index.js";
import { type SongManager } from "../structures/SongManager.js";
import { formatBoldCodeSpan } from "./formatCodeSpan.js";
import { i18n__mf } from "./i18n.js";

const CHUNK_SIZE = 10;
const EDIT_THROTTLE_MS = 2_000;

export function shouldShowProgress(trackCount: number, hasMeta: boolean): boolean {
    return hasMeta && trackCount > 1;
}

export function buildResolvingNotice(
    client: Rawon,
    target: Guild | string | null | undefined,
): string {
    return i18n__mf(client, target)("requestChannel.resolvingPlaylist");
}

export function buildProgressMessage(
    client: Rawon,
    target: Guild | string | null | undefined,
    done: number,
    total: number,
): string {
    const __mf = i18n__mf(client, target);
    return __mf("requestChannel.addingPlaylistToQueue", {
        current: formatBoldCodeSpan(done.toString()),
        total: formatBoldCodeSpan(total.toString()),
    });
}

export async function enqueueSongsWithUpdates(
    mgr: SongManager,
    tracks: Song[],
    who: GuildMember,
    onUpdate: (done: number, total: number) => Promise<void>,
): Promise<void> {
    const len = tracks.length;
    if (len === 0) {
        return;
    }
    if (len === 1) {
        mgr.addSong(tracks[0], who);
        return;
    }

    let lastEdit = 0;
    for (let i = 0; i < len; i += CHUNK_SIZE) {
        const slice = tracks.slice(i, Math.min(i + CHUNK_SIZE, len));
        mgr.addMultiple(slice, who);

        const done = Math.min(i + slice.length, len);
        const now = Date.now();
        if (done === len || now - lastEdit >= EDIT_THROTTLE_MS) {
            await onUpdate(done, len);
            lastEdit = now;
        }
    }
}
