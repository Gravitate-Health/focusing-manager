/**
 * Pipeline step representation for cache key generation
 */
export interface PipelineStep {
    name: string;           // Preprocessor service name
    version?: string;       // Optional version for finer-grained cache control
    configHash?: string;    // Optional config hash for preprocessor-specific settings
}

/**
 * Cache hit result with matched prefix information
 */
export interface CacheHit<T> {
    value: T;              // The cached ePI value
    matchedSteps: number;  // Number of pipeline steps that matched (prefix length)
}

/**
 * Cache statistics for monitoring and debugging
 */
export interface CacheStats {
    hits: number;
    misses: number;
    sets: number;
    errors: number;
    partialHits: number;  // Hits with matched prefix < requested steps
}

/**
 * Interface for preprocessing cache implementations
 * Supports prefix-based caching for sequential preprocessing pipelines
 */
export interface IPreprocessingCache {
    /**
     * Retrieve cached ePI for the longest matching prefix of steps
     * @param epiKey - Unique identifier for the source ePI (hash of content)
     * @param steps - Ordered list of preprocessing steps
     * @returns CacheHit with value and number of matched steps, or null if no match
     */
    get(epiKey: string, steps: PipelineStep[]): Promise<CacheHit<any> | null>;

    /**
     * Store preprocessed ePI for a specific step prefix
     * @param epiKey - Unique identifier for the source ePI
     * @param steps - Ordered list of preprocessing steps applied
     * @param value - The preprocessed ePI to cache
     * @param ttlMs - Optional TTL in milliseconds (uses default if not provided)
     */
    set(epiKey: string, steps: PipelineStep[], value: any, ttlMs?: number): Promise<void>;

    /**
     * Invalidate all cached entries for a specific ePI
     * @param epiKey - Unique identifier for the source ePI
     */
    invalidateByEpi(epiKey: string): Promise<void>;

    /**
     * Get cache statistics
     */
    getStats(): CacheStats;

    /**
     * Clear all cache entries
     */
    clear(): Promise<void>;

    /**
     * Get the name/type of the cache implementation
     */
    getName(): string;
}
