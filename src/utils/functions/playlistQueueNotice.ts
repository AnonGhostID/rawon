import { type Guild } from "discord.js";
import { type Rawon } from "../../structures/Rawon.js";
import { type PlaylistMetadata } from "../../typings/index.js";
import { formatBoldCodeSpan } from "./formatCodeSpan.js";
import { i18n__mf } from "./i18n.js";

export function formatPlaylistSummary(
    client: Rawon,
    target: Guild | string | null | undefined,
    totalAdded: number,
    playlistLabel: string,
    meta: PlaylistMetadata,
): string {
    const __mf = i18n__mf(client, target);
    const parts = [
        __mf("requestChannel.addedPlaylistToQueue", {
            count: formatBoldCodeSpan(totalAdded.toString()),
            playlist: playlistLabel,
        }),
    ];

    const dropped = meta.skippedCount ?? 0;
    if (dropped > 0) {
        const reasonKey =
            meta.skippedReason === "unavailable"
                ? "requestChannel.skippedReasonUnavailable"
                : meta.skippedReason === "unresolved"
                  ? "requestChannel.skippedReasonUnresolved"
                  : "requestChannel.skippedReasonSkipped";
        parts.push(
            __mf("requestChannel.addedPlaylistSkipped", {
                count: formatBoldCodeSpan(dropped.toString()),
                reason: __mf(reasonKey),
            }),
        );
    }

    return parts.join("\n");
}
