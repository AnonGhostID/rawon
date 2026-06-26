import { createClient, type Client as LibsqlClient } from "@libsql/client";
import Database from "better-sqlite3";
import * as config from "../../config/index.js";

export type DbParam = string | number | null;

export interface NormalizedRow {
    [column: string]: unknown;
}

export interface DatabaseBackend {
    /** Run a statement that returns no rows. Returns rows affected. */
    run(sql: string, ...params: DbParam[]): Promise<number>;
    /** Run a query that returns zero or one row. */
    get<T extends NormalizedRow = NormalizedRow>(
        sql: string,
        ...params: DbParam[]
    ): Promise<T | null>;
    /** Run a query that returns zero or more rows. */
    all<T extends NormalizedRow = NormalizedRow>(sql: string, ...params: DbParam[]): Promise<T[]>;
    /** Execute raw SQL (DDL). */
    exec(sql: string): Promise<void>;
    /** Execute PRAGMA and return rows (used by migration checks). */
    pragmaAll<T extends NormalizedRow = NormalizedRow>(sql: string): Promise<T[]>;
    /** Run multiple statements atomically. */
    transaction(statements: { sql: string; params: DbParam[] }[]): Promise<void>;
    /** Whether the backend is the remote Turso client. */
    readonly isRemote: boolean;
    /** Close the connection. No-op for the remote Turso client. */
    close(): void;
}

/** Wraps a synchronous `better-sqlite3` connection behind the async `DatabaseBackend` interface. */
export class LocalBackend implements DatabaseBackend {
    public readonly isRemote = false;
    private readonly db: Database.Database;

    public constructor(dbPath: string) {
        this.db = new Database(dbPath, { verbose: undefined });
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
    }

    public async run(sql: string, ...params: DbParam[]): Promise<number> {
        return this.db.prepare(sql).run(...params).changes;
    }

    public async get<T extends NormalizedRow = NormalizedRow>(
        sql: string,
        ...params: DbParam[]
    ): Promise<T | null> {
        return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
    }

    public async all<T extends NormalizedRow = NormalizedRow>(
        sql: string,
        ...params: DbParam[]
    ): Promise<T[]> {
        return this.db.prepare(sql).all(...params) as T[];
    }

    public async exec(sql: string): Promise<void> {
        this.db.exec(sql);
    }

    public async pragmaAll<T extends NormalizedRow = NormalizedRow>(sql: string): Promise<T[]> {
        return this.db.prepare(sql).all() as T[];
    }

    public async transaction(statements: { sql: string; params: DbParam[] }[]): Promise<void> {
        const fn = this.db.transaction(() => {
            for (const s of statements) {
                this.db.prepare(s.sql).run(...s.params);
            }
        });
        fn();
    }

    public close(): void {
        this.db.close();
    }
}

/** Wraps an async `@libsql/client` (Turso/libSQL) connection behind the `DatabaseBackend` interface. */
export class RemoteBackend implements DatabaseBackend {
    public readonly isRemote = true;
    private readonly client: LibsqlClient;

    public constructor(url: string, authToken?: string) {
        this.client = createClient({ url, authToken: authToken || undefined });
    }

    public async run(sql: string, ...params: DbParam[]): Promise<number> {
        const rs = await this.client.execute({ sql, args: params });
        return rs.rowsAffected;
    }

    public async get<T extends NormalizedRow = NormalizedRow>(
        sql: string,
        ...params: DbParam[]
    ): Promise<T | null> {
        const rs = await this.client.execute({ sql, args: params });
        return (rs.rows[0] as unknown as T | undefined) ?? null;
    }

    public async all<T extends NormalizedRow = NormalizedRow>(
        sql: string,
        ...params: DbParam[]
    ): Promise<T[]> {
        const rs = await this.client.execute({ sql, args: params });
        return rs.rows as unknown as T[];
    }

    public async exec(sql: string): Promise<void> {
        await this.client.executeMultiple(sql);
    }

    public async pragmaAll<T extends NormalizedRow = NormalizedRow>(sql: string): Promise<T[]> {
        const rs = await this.client.execute(sql);
        return rs.rows as unknown as T[];
    }

    public async transaction(statements: { sql: string; params: DbParam[] }[]): Promise<void> {
        await this.client.batch(statements.map((s) => ({ sql: s.sql, args: s.params })));
    }

    public close(): void {
        // Turso HTTP client: no close needed.
    }
}

/** Select the appropriate backend based on whether a Turso URL is configured. */
export function createBackend(dbPath: string): DatabaseBackend {
    if (config.useRemoteDb) {
        return new RemoteBackend(config.tursoUrl, config.tursoAuthToken);
    }
    return new LocalBackend(dbPath);
}
