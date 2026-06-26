import { type ExtendedDataManager, type GuildData } from "../typings/index.js";

export type FallbackDataManager = {
    data?: Record<string, GuildData> | null;
    save?: (fn: () => Record<string, GuildData>) => Promise<unknown>;
    load?: () => Promise<unknown>;
};

export function hasGetRequestChannel(
    v: unknown,
): v is Pick<ExtendedDataManager, "getRequestChannel"> {
    return (
        typeof v === "object" &&
        v !== null &&
        "getRequestChannel" in v &&
        typeof (v as ExtendedDataManager).getRequestChannel === "function"
    );
}

export function hasSaveRequestChannel(
    v: unknown,
): v is Pick<ExtendedDataManager, "saveRequestChannel"> {
    return (
        typeof v === "object" &&
        v !== null &&
        "saveRequestChannel" in v &&
        typeof (v as ExtendedDataManager).saveRequestChannel === "function"
    );
}

export function hasGetPlayerState(v: unknown): v is Pick<ExtendedDataManager, "getPlayerState"> {
    return (
        typeof v === "object" &&
        v !== null &&
        "getPlayerState" in v &&
        typeof (v as ExtendedDataManager).getPlayerState === "function"
    );
}

export function hasSavePlayerState(v: unknown): v is Pick<ExtendedDataManager, "savePlayerState"> {
    return (
        typeof v === "object" &&
        v !== null &&
        "savePlayerState" in v &&
        typeof (v as ExtendedDataManager).savePlayerState === "function"
    );
}

export function hasSaveQueueState(v: unknown): v is Pick<ExtendedDataManager, "saveQueueState"> {
    return (
        typeof v === "object" &&
        v !== null &&
        "saveQueueState" in v &&
        typeof (v as ExtendedDataManager).saveQueueState === "function"
    );
}

export function hasDeleteQueueState(
    v: unknown,
): v is Pick<ExtendedDataManager, "deleteQueueState"> {
    return (
        typeof v === "object" &&
        v !== null &&
        "deleteQueueState" in v &&
        typeof (v as ExtendedDataManager).deleteQueueState === "function"
    );
}

export function hasDeletePlayerState(
    v: unknown,
): v is Pick<ExtendedDataManager, "deletePlayerState"> {
    return (
        typeof v === "object" &&
        v !== null &&
        "deletePlayerState" in v &&
        typeof (v as ExtendedDataManager).deletePlayerState === "function"
    );
}

export function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
    return (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (typeof (e as NodeJS.ErrnoException).code === "string" ||
            typeof (e as NodeJS.ErrnoException).code === "number")
    );
}

export function hasGetQueueState(
    v: unknown,
): v is { getQueueState(guildId: string, botId: string): unknown } {
    return (
        typeof v === "object" &&
        v !== null &&
        "getQueueState" in v &&
        typeof (v as { getQueueState: unknown }).getQueueState === "function"
    );
}

export function hasGetGuildIdsWithQueueState(
    v: unknown,
): v is { getGuildIdsWithQueueState(botId: string): string[] } {
    return (
        typeof v === "object" &&
        v !== null &&
        "getGuildIdsWithQueueState" in v &&
        typeof (v as { getGuildIdsWithQueueState: unknown }).getGuildIdsWithQueueState ===
            "function"
    );
}

export interface FfmpegStreamWithEvents {
    stderr?: {
        on?(event: string, cb: (chunk: import("node:buffer").Buffer) => void): void;
    };
    on?(event: string, cb: (...args: unknown[]) => void): void;
}
