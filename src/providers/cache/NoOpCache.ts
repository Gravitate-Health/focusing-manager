import { IPreprocessingCache, CacheHit, PipelineStep, CacheStats } from './IPreprocessingCache';

/**
 * No-op cache implementation that never caches anything
 * Used when caching is disabled
 */
export class NoOpCache implements IPreprocessingCache {
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        sets: 0,
        errors: 0,
        partialHits: 0
    };

    async get(epiKey: string, steps: PipelineStep[]): Promise<CacheHit<any> | null> {
        this.stats.misses++;
        return null;
    }

    async set(epiKey: string, steps: PipelineStep[], value: any, ttlMs?: number): Promise<void> {
        this.stats.sets++;
        // Do nothing
    }

    async invalidateByEpi(epiKey: string): Promise<void> {
        // Do nothing
    }

    getStats(): CacheStats {
        return { ...this.stats };
    }

    async clear(): Promise<void> {
        // Do nothing
    }

    getName(): string {
        return 'none';
    }
}
