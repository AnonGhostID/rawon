import { type Song } from "../../typings/index.js";

export function getYouTubeThumbnail(videoId: string): string {
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function getYouTubeMaxResThumbnail(videoId: string): string {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

export function getSoundCloudThumbnail(url: string | undefined | null): string {
    if (!url || url.length === 0) {
        return "";
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return url;
    }

    if (!/sndcdn\.com$/u.test(parsedUrl.hostname)) {
        return url;
    }

    parsedUrl.pathname = parsedUrl.pathname.replace(
        /-(?:t\d+x\d+|crop|large|small|tiny|mini|badge|original)\.(jpg|jpeg|png|webp)$/iu,
        "-t500x500.$1",
    );

    return parsedUrl.toString();
}

export function getMaxResThumbnail(url: string | undefined | null): string {
    if (!url || url.length === 0) {
        return "";
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return url;
    }

    const validHosts = ["img.youtube.com", "i.ytimg.com"];
    if (!validHosts.includes(parsedUrl.hostname)) {
        return url;
    }

    const videoIdMatch = parsedUrl.pathname.match(/\/vi(?:_webp)?\/([^/]+)/u);
    if (!videoIdMatch?.[1]) {
        return url;
    }

    return getYouTubeThumbnail(videoIdMatch[1]);
}

export function normalizeSongThumbnail(song: Song): Song {
    if (!song.thumbnail || song.thumbnail.length === 0) {
        const ytMatch = song.url?.match(/(?:youtube\.com|youtu\.be).+/gu);
        if (ytMatch) {
            const idMatch = song.url.match(
                /(?:youtu\.be\/|v=|\/v\/|\/shorts\/|\/live\/)([a-zA-Z0-9_-]{11})/u,
            );
            if (idMatch?.[1]) {
                return { ...song, thumbnail: getYouTubeThumbnail(idMatch[1]) };
            }
        }
    }
    return song;
}

export function normalizeTrackThumbnails(tracks: Song[]): Song[] {
    return tracks.map(normalizeSongThumbnail);
}
