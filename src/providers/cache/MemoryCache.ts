import { IPreprocessingCache, CacheHit, PipelineStep, CacheStats } from './IPreprocessingCache';
import { generateCacheKey } from './utils';
import { Logger } from '../../utils/Logger';

interface CacheEntry {
    value: any;
    expiresAt: number;
    size: number;  // Approximate size in bytes for LRU eviction
}

/**
 * In-memory LRU cache with TTL support
 * Best for single-replica deployments or as a front cache
 */
export class MemoryCache implements IPreprocessingCache {
    private cache: Map<string, CacheEntry> = new Map();
    private accessOrder: string[] = []; // For LRU tracking
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        sets: 0,
        errors: 0,
        partialHits: 0
    };

    private readonly maxItems: number;
    private readonly defaultTtlMs: number;
    private readonly schemaVersion: string;

    constructor(
        maxItems: number = 1000,
        defaultTtlMs: number = 1200000, // 20 minutes
        schemaVersion: string = '1'
    ) {
        this.maxItems = maxItems;
        this.defaultTtlMs = defaultTtlMs;
        this.schemaVersion = schemaVersion;
        
        Logger.logInfo('MemoryCache', 'constructor', 
            `Initialized with maxItems=${maxItems}, ttl=${defaultTtlMs}ms`);
    }

    async get(epiKey: string, steps: PipelineStep[]): Promise<CacheHit<any> | null> {
        try {
            // Try to find longest matching prefix
            for (let i = steps.length; i > 0; i--) {
                const prefixSteps = steps.slice(0, i);
                const key = generateCacheKey(epiKey, prefixSteps, this.schemaVersion);
                
                const entry = this.cache.get(key);
                
                if (entry) {
                    // Check if expired
                    if (Date.now() > entry.expiresAt) {
                        this.cache.delete(key);
                        this.removeFromAccessOrder(key);
                        continue;
                    }

                    // Update access order for LRU
                    this.updateAccessOrder(key);

                    if (i === steps.length) {
                        this.stats.hits++;
                        Logger.logDebug('MemoryCache', 'get', 
                            `Cache HIT: full match (${i}/${steps.length} steps)`);
                    } else {
                        this.stats.partialHits++;
                        Logger.logDebug('MemoryCache', 'get', 
                            `Cache PARTIAL HIT: ${i}/${steps.length} steps matched`);
                    }

                    return {
                        value: entry.value,
                        matchedSteps: i
                    };
                }
            }

            this.stats.misses++;
            Logger.logDebug('MemoryCache', 'get', 'Cache MISS: no prefix matched');
            return null;
        } catch (error) {
            this.stats.errors++;
            Logger.logError('MemoryCache', 'get', `Error: ${error}`);
            return null;
        }
    }

    async set(epiKey: string, steps: PipelineStep[], value: any, ttlMs?: number): Promise<void> {
        try {
            const key = generateCacheKey(epiKey, steps, this.schemaVersion);
            const ttl = ttlMs || this.defaultTtlMs;
            const size = this.estimateSize(value);

            const entry: CacheEntry = {
                value: value,
                expiresAt: Date.now() + ttl,
                size: size
            };

            // Evict if at capacity
            if (this.cache.size >= this.maxItems && !this.cache.has(key)) {
                this.evictLRU();
            }

            this.cache.set(key, entry);
            this.updateAccessOrder(key);
            this.stats.sets++;

            Logger.logDebug('MemoryCache', 'set', 
                `Cached ${steps.length} steps, size=${size}, entries=${this.cache.size}`);
        } catch (error) {
            this.stats.errors++;
            Logger.logError('MemoryCache', 'set', `Error: ${error}`);
        }
    }

    async invalidateByEpi(epiKey: string): Promise<void> {
        try {
            const keysToDelete: string[] = [];
            
            // Find all keys matching this ePI
            for (const key of this.cache.keys()) {
                if (key.includes(`:${epiKey}:`)) {
                    keysToDelete.push(key);
                }
            }

            for (const key of keysToDelete) {
                this.cache.delete(key);
                this.removeFromAccessOrder(key);
            }

            Logger.logInfo('MemoryCache', 'invalidateByEpi', 
                `Invalidated ${keysToDelete.length} entries for ePI ${epiKey.substring(0, 8)}...`);
        } catch (error) {
            this.stats.errors++;
            Logger.logError('MemoryCache', 'invalidateByEpi', `Error: ${error}`);
        }
    }

    getStats(): CacheStats {
        return { ...this.stats };
    }

    async clear(): Promise<void> {
        this.cache.clear();
        this.accessOrder = [];
        Logger.logInfo('MemoryCache', 'clear', 'Cache cleared');
    }

    getName(): string {
        return 'memory';
    }

    // LRU management
    private updateAccessOrder(key: string): void {
        this.removeFromAccessOrder(key);
        this.accessOrder.push(key);
    }

    private removeFromAccessOrder(key: string): void {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
    }

    private evictLRU(): void {
        if (this.accessOrder.length === 0) return;

        const keyToEvict = this.accessOrder[0];
        
        this.cache.delete(keyToEvict);
        this.accessOrder.shift();
        
        Logger.logDebug('MemoryCache', 'evictLRU', 
            `Evicted LRU entry, cache size now ${this.cache.size}`);
    }

    private estimateSize(value: any): number {
        try {
            return JSON.stringify(value).length;
        } catch {
            return 1000; // Default estimate
        }
    }
}
