import { IPreprocessingCache, CacheHit, PipelineStep, CacheStats } from './IPreprocessingCache';
import { Logger } from '../../utils/Logger';

/**
 * Composite cache using memory as L1 and another cache (typically Redis) as L2
 * Provides fast local access with shared cross-replica persistence
 */
export class CompositeCache implements IPreprocessingCache {
    private l1Cache: IPreprocessingCache;  // Fast local cache (memory)
    private l2Cache: IPreprocessingCache;  // Shared cache (Redis/external)
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        sets: 0,
        errors: 0,
        partialHits: 0
    };

    constructor(l1Cache: IPreprocessingCache, l2Cache: IPreprocessingCache) {
        this.l1Cache = l1Cache;
        this.l2Cache = l2Cache;
        
        Logger.logInfo('CompositeCache', 'constructor', 
            `Initialized with L1=${l1Cache.getName()}, L2=${l2Cache.getName()}`);
    }

    async get(epiKey: string, steps: PipelineStep[]): Promise<CacheHit<any> | null> {
        try {
            // Try L1 cache first
            const l1Result = await this.l1Cache.get(epiKey, steps);
            if (l1Result) {
                if (l1Result.matchedSteps === steps.length) {
                    this.stats.hits++;
                    Logger.logDebug('CompositeCache', 'get', 'L1 cache HIT');
                } else {
                    this.stats.partialHits++;
                    Logger.logDebug('CompositeCache', 'get', 
                        `L1 cache PARTIAL HIT: ${l1Result.matchedSteps}/${steps.length}`);
                }
                return l1Result;
            }

            // Try L2 cache
            const l2Result = await this.l2Cache.get(epiKey, steps);
            if (l2Result) {
                // Populate L1 cache for future requests
                await this.l1Cache.set(epiKey, steps.slice(0, l2Result.matchedSteps), l2Result.value);
                
                if (l2Result.matchedSteps === steps.length) {
                    this.stats.hits++;
                    Logger.logDebug('CompositeCache', 'get', 'L2 cache HIT (promoted to L1)');
                } else {
                    this.stats.partialHits++;
                    Logger.logDebug('CompositeCache', 'get', 
                        `L2 cache PARTIAL HIT: ${l2Result.matchedSteps}/${steps.length} (promoted to L1)`);
                }
                return l2Result;
            }

            this.stats.misses++;
            Logger.logDebug('CompositeCache', 'get', 'Cache MISS in both L1 and L2');
            return null;
        } catch (error) {
            this.stats.errors++;
            Logger.logError('CompositeCache', 'get', `Error: ${error}`);
            return null;
        }
    }

    async set(epiKey: string, steps: PipelineStep[], value: any, ttlMs?: number): Promise<void> {
        try {
            // Write to both caches
            await Promise.all([
                this.l1Cache.set(epiKey, steps, value, ttlMs),
                this.l2Cache.set(epiKey, steps, value, ttlMs)
            ]);
            
            this.stats.sets++;
            Logger.logDebug('CompositeCache', 'set', 
                `Cached ${steps.length} steps in both L1 and L2`);
        } catch (error) {
            this.stats.errors++;
            Logger.logError('CompositeCache', 'set', `Error: ${error}`);
        }
    }

    async invalidateByEpi(epiKey: string): Promise<void> {
        try {
            await Promise.all([
                this.l1Cache.invalidateByEpi(epiKey),
                this.l2Cache.invalidateByEpi(epiKey)
            ]);
            
            Logger.logInfo('CompositeCache', 'invalidateByEpi', 
                `Invalidated ePI ${epiKey.substring(0, 8)}... from both L1 and L2`);
        } catch (error) {
            this.stats.errors++;
            Logger.logError('CompositeCache', 'invalidateByEpi', `Error: ${error}`);
        }
    }

    getStats(): CacheStats {
        // Combine stats from both levels
        const l1Stats = this.l1Cache.getStats();
        const l2Stats = this.l2Cache.getStats();
        
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            sets: this.stats.sets,
            errors: this.stats.errors + l1Stats.errors + l2Stats.errors,
            partialHits: this.stats.partialHits
        };
    }

    async clear(): Promise<void> {
        try {
            await Promise.all([
                this.l1Cache.clear(),
                this.l2Cache.clear()
            ]);
            
            Logger.logInfo('CompositeCache', 'clear', 'Cleared both L1 and L2 caches');
        } catch (error) {
            this.stats.errors++;
            Logger.logError('CompositeCache', 'clear', `Error: ${error}`);
        }
    }

    getName(): string {
        return `composite(${this.l1Cache.getName()}+${this.l2Cache.getName()})`;
    }

    /**
     * Get detailed stats from individual cache levels
     */
    getDetailedStats(): { composite: CacheStats; l1: CacheStats; l2: CacheStats } {
        return {
            composite: this.getStats(),
            l1: this.l1Cache.getStats(),
            l2: this.l2Cache.getStats()
        };
    }
}
