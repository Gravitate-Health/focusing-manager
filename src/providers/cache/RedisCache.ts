import { IPreprocessingCache, CacheHit, PipelineStep, CacheStats } from './IPreprocessingCache';
import { generateCacheKey, generateEpiPattern, compressJson, decompressJson } from './utils';
import { Logger } from '../../utils/Logger';
import { createClient, RedisClientType } from 'redis';

/**
 * Redis-based cache for shared preprocessing results across replicas
 * Supports optional compression for large payloads
 */
export class RedisCache implements IPreprocessingCache {
    private client: RedisClientType | null = null;
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        sets: 0,
        errors: 0,
        partialHits: 0
    };

    private readonly redisUrl: string;
    private readonly defaultTtlMs: number;
    private readonly schemaVersion: string;
    private readonly compress: boolean;
    private connected: boolean = false;

    constructor(
        redisUrl: string = 'redis://localhost:6379',
        defaultTtlMs: number = 1200000, // 20 minutes
        schemaVersion: string = '1',
        compress: boolean = false
    ) {
        this.redisUrl = redisUrl;
        this.defaultTtlMs = defaultTtlMs;
        this.schemaVersion = schemaVersion;
        this.compress = compress;
        
        Logger.logInfo('RedisCache', 'constructor', 
            `Initializing with url=${redisUrl}, ttl=${defaultTtlMs}ms, compress=${compress}`);
    }

    private async ensureConnected(): Promise<void> {
        if (this.connected && this.client) {
            return;
        }

        try {
            this.client = createClient({ url: this.redisUrl }) as RedisClientType;
            
            this.client.on('error', (err) => {
                Logger.logError('RedisCache', 'client', `Redis error: ${err}`);
                this.stats.errors++;
            });

            await this.client.connect();
            this.connected = true;
            
            Logger.logInfo('RedisCache', 'ensureConnected', 'Connected to Redis');
        } catch (error) {
            this.stats.errors++;
            Logger.logError('RedisCache', 'ensureConnected', `Failed to connect: ${error}`);
            throw error;
        }
    }

    async get(epiKey: string, steps: PipelineStep[]): Promise<CacheHit<any> | null> {
        try {
            await this.ensureConnected();
            if (!this.client) return null;

            // Try to find longest matching prefix
            for (let i = steps.length; i > 0; i--) {
                const prefixSteps = steps.slice(0, i);
                const key = generateCacheKey(epiKey, prefixSteps, this.schemaVersion);
                
                const data = await this.client.get(key);
                
                if (data) {
                    let value: any;
                    
                    if (this.compress) {
                        // Data is base64-encoded compressed JSON
                        const buffer = Buffer.from(data, 'base64');
                        value = await decompressJson(buffer);
                    } else {
                        value = JSON.parse(data);
                    }

                    if (i === steps.length) {
                        this.stats.hits++;
                        Logger.logDebug('RedisCache', 'get', 
                            `Cache HIT: full match (${i}/${steps.length} steps)`);
                    } else {
                        this.stats.partialHits++;
                        Logger.logDebug('RedisCache', 'get', 
                            `Cache PARTIAL HIT: ${i}/${steps.length} steps matched`);
                    }

                    return {
                        value: value,
                        matchedSteps: i
                    };
                }
            }

            this.stats.misses++;
            Logger.logDebug('RedisCache', 'get', 'Cache MISS: no prefix matched');
            return null;
        } catch (error) {
            this.stats.errors++;
            Logger.logError('RedisCache', 'get', `Error: ${error}`);
            return null;
        }
    }

    async set(epiKey: string, steps: PipelineStep[], value: any, ttlMs?: number): Promise<void> {
        try {
            await this.ensureConnected();
            if (!this.client) return;

            const key = generateCacheKey(epiKey, steps, this.schemaVersion);
            const ttl = ttlMs || this.defaultTtlMs;
            const ttlSeconds = Math.ceil(ttl / 1000);

            let dataToStore: string;
            
            if (this.compress) {
                const compressed = await compressJson(value);
                dataToStore = compressed.toString('base64');
            } else {
                dataToStore = JSON.stringify(value);
            }

            await this.client.setEx(key, ttlSeconds, dataToStore);
            this.stats.sets++;

            Logger.logDebug('RedisCache', 'set', 
                `Cached ${steps.length} steps, ttl=${ttlSeconds}s, compressed=${this.compress}`);
        } catch (error) {
            this.stats.errors++;
            Logger.logError('RedisCache', 'set', `Error: ${error}`);
        }
    }

    async invalidateByEpi(epiKey: string): Promise<void> {
        try {
            await this.ensureConnected();
            if (!this.client) return;

            const pattern = generateEpiPattern(epiKey, this.schemaVersion);
            const keys: string[] = [];

            // Scan for matching keys
            for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
                keys.push(key);
            }

            if (keys.length > 0) {
                await this.client.del(keys);
            }

            Logger.logInfo('RedisCache', 'invalidateByEpi', 
                `Invalidated ${keys.length} entries for ePI ${epiKey.substring(0, 8)}...`);
        } catch (error) {
            this.stats.errors++;
            Logger.logError('RedisCache', 'invalidateByEpi', `Error: ${error}`);
        }
    }

    getStats(): CacheStats {
        return { ...this.stats };
    }

    async clear(): Promise<void> {
        try {
            await this.ensureConnected();
            if (!this.client) return;

            await this.client.flushDb();
            Logger.logInfo('RedisCache', 'clear', 'Cache cleared');
        } catch (error) {
            this.stats.errors++;
            Logger.logError('RedisCache', 'clear', `Error: ${error}`);
        }
    }

    getName(): string {
        return 'redis';
    }

    async disconnect(): Promise<void> {
        if (this.client && this.connected) {
            await this.client.quit();
            this.connected = false;
            Logger.logInfo('RedisCache', 'disconnect', 'Disconnected from Redis');
        }
    }
}
