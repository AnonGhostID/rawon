import { type Buffer } from "node:buffer";
import { type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
    createReadStream,
    createWriteStream,
    existsSync,
    mkdirSync,
    type ReadStream,
    renameSync,
    rmSync,
    statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { PassThrough, type Readable } from "node:stream";
import { clearInterval, setInterval, setTimeout } from "node:timers";
import got from "got";
import { type Rawon } from "../../structures/Rawon.js";

const PRE_CACHE_AHEAD_COUNT = 5;
const MAX_CACHE_SIZE_MB = 500;
const MAX_CACHE_FILES = 50;
const PRE_CACHE_RETRY_COUNT = 2;
const QUEUE_PROCESSING_DELAY_MS = 50;
const MAX_PRE_CACHE_RETRIES = 2;
const MAX_CONCURRENT_PRECACHE = 2;

function isFatalYtDlpError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return (
        lower.startsWith("error:") ||
        lower.includes("\nerror:") ||
        lower.includes("unable to download video") ||
        lower.includes("unable to rename file") ||
        lower.includes("no such file or directory")
    );
}

function isSoundcloudUrl(url: string): boolean {
    try {
        return /soundcloud|snd/gu.test(new URL(url).hostname);
    } catch {
        return false;
    }
}

export class AudioCacheManager {
    public readonly cacheDir: string;
    private static readonly sharedCachedFiles = new Map<
        string,
        { path: string; lastAccess: number }
    >();
    private static readonly sharedInProgressFiles = new Set<string>();
    private static readonly sharedCanceledCacheKeys = new Set<string>();
    private static readonly sharedInProgressProcs = new Map<
        string,
        {
            owner: AudioCacheManager;
            proc?: ChildProcess;
            stream?: Readable;
            writeStreamPath?: string;
        }
    >();
    private readonly cachedFiles = AudioCacheManager.sharedCachedFiles;
    private readonly inProgressFiles = AudioCacheManager.sharedInProgressFiles;
    private readonly canceledCacheKeys = AudioCacheManager.sharedCanceledCacheKeys;
    private readonly inProgressProcs = AudioCacheManager.sharedInProgressProcs;
    private readonly failedUrls = new Map<string, { count: number; lastAttempt: number }>();
    private readonly preCacheQueue: string[] = [];
    private isProcessingQueue = false;

    public constructor(public readonly client: Rawon) {
        this.cacheDir = path.resolve(process.cwd(), "cache", "audio");
        this.ensureCacheDir();
    }

    private async isDirectDownload(url: string): Promise<boolean> {
        try {
            const extRegex = /\.(mp4|m4a|webm|mp3|opus|wav|flac)(\?|$)/i;
            if (extRegex.test(url)) {
                return true;
            }

            const res = await got.head(url, {
                timeout: { request: 2_000 },
                throwHttpErrors: false,
            });
            const ct = (res.headers["content-type"] ?? "").toString().toLowerCase();
            if (ct.startsWith("audio/") || ct.startsWith("video/")) {
                return true;
            }

            const cd = (res.headers["content-disposition"] ?? "").toString().toLowerCase();
            if (cd.includes("attachment")) {
                return true;
            }
        } catch {}
        return false;
    }

    private ensureCacheDir(): void {
        if (!existsSync(this.cacheDir)) {
            mkdirSync(this.cacheDir, { recursive: true });
            this.client.logger.debug("[AudioCacheManager] Cache directory created.");
        }
    }

    public getCacheKey(url: string): string {
        return createHash("md5").update(url).digest("hex");
    }

    public getCachePath(url: string): string {
        const key = this.getCacheKey(url);
        return path.join(this.cacheDir, `${key}.opus`);
    }

    private getPartialCachePath(url: string): string {
        return `${this.getCachePath(url)}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.part`;
    }

    private releaseInProgress(key: string): void {
        if (this.inProgressProcs.get(key)?.owner !== this) {
            return;
        }

        this.inProgressProcs.delete(key);
        this.inProgressFiles.delete(key);
    }

    public isCached(url: string): boolean {
        const key = this.getCacheKey(url);
        const cachePath = this.getCachePath(url);

        if (this.inProgressFiles.has(key)) {
            return false;
        }

        if (this.cachedFiles.has(key) && existsSync(cachePath)) {
            return true;
        }

        return false;
    }

    public isInProgress(url: string): boolean {
        const key = this.getCacheKey(url);
        return this.inProgressFiles.has(key);
    }

    public getFromCache(url: string): ReadStream | null {
        if (!this.isCached(url)) {
            return null;
        }

        const cachePath = this.getCachePath(url);
        const key = this.getCacheKey(url);

        try {
            if (!existsSync(cachePath)) {
                this.client.logger.warn(
                    `[AudioCacheManager] Cached file missing for ${url.slice(0, 50)}..., removing from cache`,
                );
                this.cachedFiles.delete(key);
                return null;
            }

            const stats = statSync(cachePath);
            if (stats.size < 1024) {
                this.client.logger.warn(
                    `[AudioCacheManager] Cached file too small (${stats.size} bytes) for ${url.slice(0, 50)}..., removing invalid cache`,
                );
                this.cachedFiles.delete(key);
                rmSync(cachePath, { force: true });
                return null;
            }
        } catch (error) {
            this.client.logger.error(
                `[AudioCacheManager] Error validating cache for ${url.slice(0, 50)}...:`,
                error,
            );
            this.cachedFiles.delete(key);
            return null;
        }

        const cacheEntry = this.cachedFiles.get(key);
        if (cacheEntry) {
            cacheEntry.lastAccess = Date.now();
        }

        this.client.logger.debug(`[AudioCacheManager] Cache hit for: ${url.slice(0, 50)}...`);
        return createReadStream(cachePath);
    }

    public cacheStream(url: string, sourceStream: Readable): Readable {
        const cachePath = this.getCachePath(url);
        const partialCachePath = this.getPartialCachePath(url);
        const key = this.getCacheKey(url);

        if (this.inProgressFiles.has(key)) {
            return sourceStream;
        }

        this.inProgressFiles.add(key);

        this.inProgressProcs.set(key, {
            owner: this,
            stream: sourceStream,
            writeStreamPath: partialCachePath,
        });

        const playbackStream = new PassThrough();
        const cacheStream = new PassThrough();
        const writeStream = createWriteStream(partialCachePath);
        let cacheFailed = false;

        sourceStream.pipe(playbackStream);
        sourceStream.pipe(cacheStream);

        cacheStream.pipe(writeStream);

        writeStream.on("error", (error) => {
            cacheFailed = true;
            this.client.logger.error("[AudioCacheManager] Error writing cache file:", error);
            this.cachedFiles.delete(key);
            this.releaseInProgress(key);
            try {
                rmSync(partialCachePath, { force: true });
            } catch {}
        });

        writeStream.on("finish", () => {
            this.releaseInProgress(key);

            if (cacheFailed || this.canceledCacheKeys.has(key)) {
                this.canceledCacheKeys.delete(key);
                try {
                    rmSync(partialCachePath, { force: true });
                } catch {}
                return;
            }

            try {
                const stats = statSync(partialCachePath);
                if (stats.size < 1024) {
                    this.client.logger.warn(
                        `[AudioCacheManager] Cached file too small (${stats.size} bytes) for ${url.slice(0, 50)}..., discarding`,
                    );
                    rmSync(partialCachePath, { force: true });
                    return;
                }
                renameSync(partialCachePath, cachePath);
            } catch {
                this.client.logger.warn(
                    `[AudioCacheManager] Could not stat cached file for ${url.slice(0, 50)}..., discarding`,
                );
                try {
                    rmSync(partialCachePath, { force: true });
                } catch {}
                return;
            }

            this.cachedFiles.set(key, {
                path: cachePath,
                lastAccess: Date.now(),
            });
            this.client.logger.info(`[AudioCacheManager] Cached audio for: ${url.slice(0, 50)}...`);
            this.failedUrls.delete(key);
            void this.cleanupOldCache();
        });

        sourceStream.on("error", (error) => {
            cacheFailed = true;
            this.client.logger.error("[AudioCacheManager] Source stream error:", error);
            playbackStream.destroy(error);
            cacheStream.destroy();
            writeStream.destroy();
            this.cachedFiles.delete(key);
            this.releaseInProgress(key);
            try {
                rmSync(partialCachePath, { force: true });
            } catch {}
        });

        return playbackStream;
    }

    public async preCacheUrl(url: string, priority = false): Promise<boolean> {
        if (isSoundcloudUrl(url)) {
            return false;
        }

        if (this.isCached(url)) {
            return true;
        }

        const key = this.getCacheKey(url);
        if (this.inProgressFiles.has(key)) {
            return true;
        }

        const failedInfo = this.failedUrls.get(key);
        if (failedInfo && failedInfo.count >= PRE_CACHE_RETRY_COUNT) {
            const timeSinceLastAttempt = Date.now() - failedInfo.lastAttempt;
            if (timeSinceLastAttempt < 60000) {
                return false;
            }
            this.failedUrls.delete(key);
        }

        if (priority) {
            const index = this.preCacheQueue.indexOf(url);
            if (index > 0) {
                this.preCacheQueue.splice(index, 1);
            }
            if (index !== 0) {
                this.preCacheQueue.unshift(url);
            }
        } else if (!this.preCacheQueue.includes(url)) {
            this.preCacheQueue.push(url);
        }

        void this.processQueue();
        return true;
    }

    public async preCacheMultiple(urls: string[]): Promise<void> {
        for (const url of urls.slice(0, PRE_CACHE_AHEAD_COUNT)) {
            if (url && !this.isCached(url) && !this.isInProgress(url)) {
                await this.preCacheUrl(url);
            }
        }
    }

    public async waitForCache(url: string, timeoutMs = 300_000): Promise<boolean> {
        const key = this.getCacheKey(url);

        if (this.isCached(url) && !this.isInProgress(url)) {
            return true;
        }

        if (!this.isInProgress(url) && !this.isCached(url)) {
            this.client.logger.info(
                `[AudioCacheManager] Cache not found for ${url.slice(0, 50)}..., starting high-priority cache`,
            );
            await this.preCacheUrl(url, true);
        }

        const startTime = Date.now();
        const pollInterval = 200;

        return new Promise<boolean>((resolve) => {
            const checkCache = setInterval(() => {
                if (this.isCached(url) && !this.inProgressFiles.has(key)) {
                    clearInterval(checkCache);
                    this.client.logger.info(
                        `[AudioCacheManager] Cache completed for ${url.slice(0, 50)}... after ${Date.now() - startTime} ms`,
                    );
                    resolve(true);
                    return;
                }

                if (Date.now() - startTime >= timeoutMs) {
                    clearInterval(checkCache);
                    this.client.logger.warn(
                        `[AudioCacheManager] Timeout waiting for cache ${url.slice(0, 50)}... after ${timeoutMs} ms`,
                    );
                    resolve(false);
                    return;
                }

                const failedInfo = this.failedUrls.get(key);
                if (failedInfo && failedInfo.count >= PRE_CACHE_RETRY_COUNT) {
                    clearInterval(checkCache);
                    this.client.logger.warn(
                        `[AudioCacheManager] Cache failed for ${url.slice(0, 50)}... after ${failedInfo.count} attempts`,
                    );
                    resolve(false);
                    return;
                }
            }, pollInterval);
        });
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.preCacheQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.preCacheQueue.length > 0) {
            const batch: string[] = [];
            while (batch.length < MAX_CONCURRENT_PRECACHE && this.preCacheQueue.length > 0) {
                const url = this.preCacheQueue.shift();
                if (url && !this.isCached(url) && !this.isInProgress(url)) {
                    batch.push(url);
                }
            }

            if (batch.length > 0) {
                await Promise.all(batch.map((url) => this.doPreCache(url)));
            }

            if (this.preCacheQueue.length > 0) {
                await new Promise((resolve) => setTimeout(resolve, QUEUE_PROCESSING_DELAY_MS));
            }
        }

        this.isProcessingQueue = false;
    }

    private async doPreCache(url: string, retryCount = 0): Promise<void> {
        const key = this.getCacheKey(url);
        if (this.inProgressFiles.has(key)) {
            return;
        }

        this.inProgressFiles.add(key);
        this.inProgressProcs.set(key, { owner: this });
        this.canceledCacheKeys.delete(key);
        let partialCachePath: string | null = null;

        try {
            const cachePath = this.getCachePath(url);
            partialCachePath = this.getPartialCachePath(url);
            const workingCachePath = partialCachePath;

            if (await this.isDirectDownload(url)) {
                const writeStream = createWriteStream(workingCachePath);
                const httpStream = got.stream(url);
                let downloadFailed = false;
                let writeFinished = false;

                this.inProgressProcs.set(key, {
                    owner: this,
                    stream: httpStream,
                    writeStreamPath: workingCachePath,
                });

                httpStream.on("error", (err: Error) => {
                    downloadFailed = true;
                    this.client.logger.warn(
                        `[AudioCacheManager] HTTP pre-cache stream error for ${url.slice(0, 50)}...: ${err.message}`,
                    );
                    writeStream.destroy();
                });

                httpStream.pipe(writeStream);

                await new Promise<void>((resolve) => {
                    writeStream.once("finish", () => {
                        writeFinished = true;
                        resolve();
                    });
                    writeStream.once("close", resolve);
                    writeStream.once("error", () => {
                        downloadFailed = true;
                        resolve();
                    });
                });

                this.releaseInProgress(key);

                if (downloadFailed || !writeFinished || this.canceledCacheKeys.has(key)) {
                    this.canceledCacheKeys.delete(key);
                    rmSync(workingCachePath, { force: true });
                    if (downloadFailed || !writeFinished) {
                        this.markFailed(key);
                    }
                    return;
                }

                const stats = statSync(workingCachePath);
                if (stats.size < 1024) {
                    rmSync(workingCachePath, { force: true });
                    this.markFailed(key);
                    return;
                }

                renameSync(workingCachePath, cachePath);
                this.cachedFiles.set(key, {
                    path: cachePath,
                    lastAccess: Date.now(),
                });
                this.failedUrls.delete(key);
                this.client.logger.debug(
                    `[AudioCacheManager] Pre-cached audio for: ${url.slice(0, 50)}...`,
                );
            } else {
                const { exec, isBotDetectionError } = await import("../yt-dlp/index.js");

                const proc = exec(
                    url,
                    {
                        output: "-",
                        quiet: true,
                        format: "bestaudio/best",
                    },
                    { stdio: ["ignore", "pipe", "pipe"] },
                );

                this.inProgressProcs.set(key, {
                    owner: this,
                    proc,
                    writeStreamPath: workingCachePath,
                });

                if (!proc.stdout) {
                    this.releaseInProgress(key);
                    this.markFailed(key);
                    return;
                }

                let stderrData = "";
                let hasBotDetectionError = false;
                let hasFatalError = false;
                let processKilled = false;

                if (proc.stderr) {
                    proc.stderr.on("data", (chunk: Buffer) => {
                        stderrData += chunk.toString();
                        if (
                            isBotDetectionError(stderrData) &&
                            !hasBotDetectionError &&
                            !processKilled
                        ) {
                            hasBotDetectionError = true;
                            processKilled = true;
                            proc.kill("SIGKILL");

                            this.client.logger.warn(
                                `[AudioCacheManager] Bot detection during pre-cache (attempt ${retryCount + 1}/${MAX_PRE_CACHE_RETRIES}). URL: ${url.slice(0, 50)}...`,
                            );
                            this.client.cookies.handleBotDetection();
                        } else if (
                            isFatalYtDlpError(stderrData) &&
                            !hasFatalError &&
                            !processKilled
                        ) {
                            hasFatalError = true;
                            processKilled = true;
                            proc.kill("SIGKILL");

                            this.client.logger.warn(
                                `[AudioCacheManager] Fatal yt-dlp error during pre-cache. URL: ${url.slice(0, 50)}...`,
                            );
                        }
                    });

                    proc.stderr.on("end", () => {
                        if (stderrData.trim() && !hasBotDetectionError) {
                            this.client.logger.warn(
                                `[AudioCacheManager] yt-dlp stderr for ${url.slice(0, 50)}...: ${stderrData.slice(0, 500)}`,
                            );
                        }
                    });
                }

                const writeStream = createWriteStream(workingCachePath);
                let writeFailed = false;
                let writeFinished = false;
                proc.stdout.pipe(writeStream);

                const writeComplete = new Promise<void>((resolve) => {
                    writeStream.once("finish", () => {
                        writeFinished = true;
                        resolve();
                    });
                    writeStream.once("close", resolve);
                    writeStream.once("error", () => {
                        writeFailed = true;
                        resolve();
                    });
                });
                const processComplete = new Promise<number | null>((resolve) => {
                    proc.once("close", resolve);
                    proc.once("error", () => {
                        writeFailed = true;
                        writeStream.destroy();
                        resolve(null);
                    });
                });

                const [, exitCode] = await Promise.all([writeComplete, processComplete]);
                this.releaseInProgress(key);

                if (this.canceledCacheKeys.has(key)) {
                    this.canceledCacheKeys.delete(key);
                    rmSync(workingCachePath, { force: true });
                    return;
                }

                if (
                    writeFailed ||
                    !writeFinished ||
                    exitCode !== 0 ||
                    hasBotDetectionError ||
                    hasFatalError
                ) {
                    rmSync(workingCachePath, { force: true });
                    if (retryCount < MAX_PRE_CACHE_RETRIES && !hasBotDetectionError) {
                        setTimeout(
                            () => {
                                void this.doPreCache(url, retryCount + 1);
                            },
                            1000 * (retryCount + 1),
                        );
                    } else {
                        this.markFailed(key);
                    }
                    return;
                }

                const stats = statSync(workingCachePath);
                if (stats.size < 1024) {
                    rmSync(workingCachePath, { force: true });
                    this.markFailed(key);
                    return;
                }

                renameSync(workingCachePath, cachePath);
                this.cachedFiles.set(key, {
                    path: cachePath,
                    lastAccess: Date.now(),
                });
                this.failedUrls.delete(key);
                this.client.logger.info(
                    `[AudioCacheManager] Pre-cached audio for: ${url.slice(0, 50)}...`,
                );
            }

            void this.cleanupOldCache();
        } catch (error) {
            this.releaseInProgress(key);
            if (partialCachePath) {
                try {
                    rmSync(partialCachePath, { force: true });
                } catch {}
            }
            this.markFailed(key);
            this.client.logger.debug(
                `[AudioCacheManager] Failed to pre-cache: ${(error as Error).message}`,
            );
        }
    }

    private markFailed(key: string): void {
        const existing = this.failedUrls.get(key);
        this.failedUrls.set(key, {
            count: (existing?.count ?? 0) + 1,
            lastAttempt: Date.now(),
        });
    }

    private async cleanupOldCache(): Promise<void> {
        const stats = this.getStats();

        if (stats.files > MAX_CACHE_FILES || stats.totalSize > MAX_CACHE_SIZE_MB * 1024 * 1024) {
            const sortedEntries = [...this.cachedFiles.entries()].sort(
                (a, b) => a[1].lastAccess - b[1].lastAccess,
            );

            let currentSize = stats.totalSize;
            let currentFiles = stats.files;

            for (const [key, entry] of sortedEntries) {
                if (
                    currentFiles <= MAX_CACHE_FILES / 2 &&
                    currentSize <= (MAX_CACHE_SIZE_MB / 2) * 1024 * 1024
                ) {
                    break;
                }

                try {
                    if (existsSync(entry.path)) {
                        const fileStats = statSync(entry.path);
                        rmSync(entry.path, { force: true });
                        currentSize -= fileStats.size;
                        currentFiles--;
                    }
                    this.cachedFiles.delete(key);
                } catch {}
            }

            this.client.logger.info(
                `[AudioCacheManager] Cleaned up cache: ${stats.files - currentFiles} files removed`,
            );
        }
    }

    public clearCache(): void {
        this.cachedFiles.clear();
        this.inProgressFiles.clear();
        this.failedUrls.clear();
        this.preCacheQueue.length = 0;

        if (existsSync(this.cacheDir)) {
            rmSync(this.cacheDir, { recursive: true, force: true });
            this.ensureCacheDir();
            this.client.logger.info("[AudioCacheManager] Cache cleared.");
        }
    }

    public clearFailedUrls(): void {
        this.failedUrls.clear();
        this.client.logger.info("[AudioCacheManager] Failed URL cache cleared.");
    }

    public clearCacheForUrls(urls: string[]): void {
        let removedCount = 0;
        for (const url of urls) {
            const key = this.getCacheKey(url);
            const procInfo = this.inProgressProcs.get(key);
            const ownsInProgressWork = procInfo?.owner === this;
            if (ownsInProgressWork) {
                this.canceledCacheKeys.add(key);
            }
            const entry = this.cachedFiles.get(key);
            if (entry) {
                try {
                    if (existsSync(entry.path)) {
                        rmSync(entry.path, { force: true });
                        removedCount++;
                    }
                    this.cachedFiles.delete(key);
                } catch {}
            }
            if (procInfo && ownsInProgressWork) {
                try {
                    if (procInfo.proc && typeof procInfo.proc.kill === "function") {
                        procInfo.proc.kill("SIGKILL");
                    }
                    if (procInfo.stream && typeof procInfo.stream.destroy === "function") {
                        procInfo.stream.destroy();
                    }
                    if (procInfo.writeStreamPath && existsSync(procInfo.writeStreamPath)) {
                        rmSync(procInfo.writeStreamPath, { force: true });
                        removedCount++;
                    }
                } catch {}
                this.inProgressProcs.delete(key);
            }

            if (ownsInProgressWork) {
                this.inProgressFiles.delete(key);
            }
            this.failedUrls.delete(key);
            const queueIndex = this.preCacheQueue.indexOf(url);
            if (queueIndex !== -1) {
                this.preCacheQueue.splice(queueIndex, 1);
            }
        }
        if (removedCount > 0) {
            this.client.logger.info(
                `[AudioCacheManager] Cleared cache for ${removedCount} songs from destroyed queue.`,
            );
        }
    }

    public getStats(): {
        files: number;
        totalSize: number;
        inProgress: number;
        failed: number;
        queued: number;
    } {
        let totalSize = 0;
        let files = 0;

        for (const [key, entry] of this.cachedFiles) {
            if (existsSync(entry.path)) {
                const stats = statSync(entry.path);
                totalSize += stats.size;
                files++;
            } else {
                this.cachedFiles.delete(key);
            }
        }

        return {
            files,
            totalSize,
            inProgress: this.inProgressFiles.size,
            failed: this.failedUrls.size,
            queued: this.preCacheQueue.length,
        };
    }
}
