import { IPreprocessingCache } from './IPreprocessingCache';
import { MemoryCache } from './MemoryCache';
import { RedisCache } from './RedisCache';
import { CompositeCache } from './CompositeCache';
import { NoOpCache } from './NoOpCache';
import { Logger } from '../../utils/Logger';

// Configuration from environment variables
const CACHE_BACKEND = process.env.PREPROCESSING_CACHE_BACKEND || 'memory';
const CACHE_TTL_MS = parseInt(process.env.PREPROCESSING_CACHE_TTL_MS || '1200000', 10); // 20 minutes
const CACHE_MAX_ITEMS = parseInt(process.env.PREPROCESSING_CACHE_MAX_ITEMS || '1000', 10);
const CACHE_REDIS_URL = process.env.PREPROCESSING_CACHE_REDIS_URL || 'redis://localhost:6379';
const CACHE_COMPRESS = process.env.PREPROCESSING_CACHE_COMPRESS === 'true';
const CACHE_SCHEMA_VERSION = process.env.PREPROCESSING_CACHE_SCHEMA_VERSION || '1';

/**
 * Factory for creating preprocessing cache instances based on configuration
 */
export class CacheFactory {
    private static instance: IPreprocessingCache | null = null;

    /**
     * Get or create the singleton cache instance
     */
    static getCache(): IPreprocessingCache {
        if (!this.instance) {
            this.instance = this.createCache();
        }
        return this.instance;
    }

    /**
     * Create a new cache instance based on PREPROCESSING_CACHE_BACKEND env var
     */
    private static createCache(): IPreprocessingCache {
        const backend = CACHE_BACKEND.toLowerCase();

        Logger.logInfo('CacheFactory', 'createCache', 
            `Creating cache with backend=${backend}, ttl=${CACHE_TTL_MS}ms`);

        switch (backend) {
            case 'none':
            case 'disabled':
                Logger.logInfo('CacheFactory', 'createCache', 'Cache disabled');
                return new NoOpCache();

            case 'memory':
                return new MemoryCache(
                    CACHE_MAX_ITEMS,
                    CACHE_TTL_MS,
                    CACHE_SCHEMA_VERSION
                );

            case 'redis':
                return new RedisCache(
                    CACHE_REDIS_URL,
                    CACHE_TTL_MS,
                    CACHE_SCHEMA_VERSION,
                    CACHE_COMPRESS
                );

            case 'composite':
                const memCache = new MemoryCache(
                    CACHE_MAX_ITEMS,
                    CACHE_TTL_MS,
                    CACHE_SCHEMA_VERSION
                );
                const redisCache = new RedisCache(
                    CACHE_REDIS_URL,
                    CACHE_TTL_MS,
                    CACHE_SCHEMA_VERSION,
                    CACHE_COMPRESS
                );
                return new CompositeCache(memCache, redisCache);

            default:
                Logger.logWarn('CacheFactory', 'createCache', 
                    `Unknown cache backend '${backend}', falling back to memory`);
                return new MemoryCache(
                    CACHE_MAX_ITEMS,
                    CACHE_TTL_MS,
                    CACHE_SCHEMA_VERSION
                );
        }
    }

    /**
     * Reset the singleton instance (useful for testing)
     */
    static reset(): void {
        this.instance = null;
    }

    /**
     * Get current cache configuration
     */
    static getConfig() {
        return {
            backend: CACHE_BACKEND,
            ttlMs: CACHE_TTL_MS,
            maxItems: CACHE_MAX_ITEMS,
            redisUrl: CACHE_REDIS_URL,
            compress: CACHE_COMPRESS,
            schemaVersion: CACHE_SCHEMA_VERSION
        };
    }
}
