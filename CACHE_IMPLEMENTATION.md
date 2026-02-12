# Preprocessing Cache Implementation

## Overview

The Focusing Manager now includes a sophisticated caching system for preprocessing results. The cache uses a **prefix-based strategy** where each step in the preprocessing pipeline is cached independently, allowing for efficient reuse of partial results.

## Architecture

### Provider Pattern

The cache implementation follows the provider pattern with multiple backends:

```
IPreprocessingCache (interface)
├── NoOpCache (disabled)
├── MemoryCache (in-memory LRU)
├── RedisCache (shared Redis)
└── CompositeCache (Memory + Redis)
```

### Cache Key Structure

Cache keys are generated using:
- **ePI Content Hash**: SHA-256 hash of the Composition sections
- **Pipeline Signature**: Ordered list of preprocessing steps
- **Schema Version**: For cache invalidation on format changes

Format: `{schemaVersion}:{epiHash}:{step1|step2|step3}`

### Longest Prefix Matching

When processing a pipeline of preprocessors `[A, B, C, D]`:
1. Check cache for full match `[A, B, C, D]`
2. If not found, try `[A, B, C]`
3. If not found, try `[A, B]`
4. If not found, try `[A]`
5. If match found at step N, resume processing from step N+1

After each successful preprocessing step, the result is cached for future reuse.

## Cache Implementations

### 1. NoOpCache
- **Use case**: Disable caching
- **Performance**: No overhead
- **Configuration**: `PREPROCESSING_CACHE_BACKEND=none`

### 2. MemoryCache
- **Use case**: Single-replica deployments, development
- **Algorithm**: LRU (Least Recently Used) eviction
- **Pros**: Fastest, zero dependencies
- **Cons**: Per-pod only, lost on restart
- **Configuration**:
  ```bash
  PREPROCESSING_CACHE_BACKEND=memory
  PREPROCESSING_CACHE_MAX_ITEMS=1000
  PREPROCESSING_CACHE_TTL_MS=1200000
  ```

### 3. RedisCache
- **Use case**: Multi-replica production deployments
- **Features**: Shared cache, persistence, TTL support
- **Optional**: gzip compression for large payloads
- **Pros**: Shared across replicas, survives restarts
- **Cons**: Network dependency, requires Redis deployment
- **Configuration**:
  ```bash
  PREPROCESSING_CACHE_BACKEND=redis
  PREPROCESSING_CACHE_REDIS_URL=redis://redis-service:6379
  PREPROCESSING_CACHE_TTL_MS=1200000
  PREPROCESSING_CACHE_COMPRESS=true
  ```

### 4. Composite Cache Hierarchies (Recommended for Production)
- **Use case**: Multi-level caching for optimal performance
- **Syntax**: Use `<` separator to define cache hierarchy (L1 < L2 < L3)
- **Architecture**: Automatically chains multiple cache implementations
- **Behavior**:
  - Reads: Check L1 → L2 → ... → LN → Miss
  - Writes: Write to all levels
  - Cache hits promote to all upper levels
- **Pros**: Flexible, explicit configuration, optimal performance
- **Cons**: Requires understanding of cache hierarchy
- **Examples**:
  ```bash
  # Two-level: Memory (L1) + Redis (L2)
  PREPROCESSING_CACHE_BACKEND=memory<redis
  PREPROCESSING_CACHE_REDIS_URL=redis://redis-service:6379
  PREPROCESSING_CACHE_MAX_ITEMS=1000
  PREPROCESSING_CACHE_TTL_MS=1200000
  
  # Three-level: Memory < Redis < Memory (exotic but supported)
  PREPROCESSING_CACHE_BACKEND=memory<redis<memory
  
  # Single implementation (equivalent to not using <)
  PREPROCESSING_CACHE_BACKEND=memory
  ```

**Note**: The `<` operator represents cache hierarchy levels, where left-most is L1 (fastest), and subsequent levels are slower but more persistent. Any combination of implementations is supported, including repeated implementations (e.g., `memory<redis<memory`), though sensible hierarchies (fast-to-slow) are recommended for optimal performance.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PREPROCESSING_CACHE_BACKEND` | `memory` | Cache configuration: Single implementation (`none`, `memory`, `redis`) or composite hierarchy using `<` separator (e.g., `memory<redis`) |
| `PREPROCESSING_CACHE_TTL_MS` | `1200000` | TTL in ms (20 minutes) |
| `PREPROCESSING_CACHE_MAX_ITEMS` | `1000` | Max items in memory cache |
| `PREPROCESSING_CACHE_REDIS_URL` | `redis://localhost:6379` | Redis connection URL (required for `redis` in backend config) |
| `PREPROCESSING_CACHE_COMPRESS` | `false` | Enable gzip compression for Redis cache |
| `PREPROCESSING_CACHE_SCHEMA_VERSION` | `1` | Cache schema version |

## API Endpoints

### Get Cache Statistics
```bash
GET /focusing/preprocessing/cache/stats
```

Response:
```json
{
  "cacheStats": {
    "hits": 150,
    "misses": 45,
    "sets": 180,
    "errors": 2,
    "partialHits": 30
  }
}
```

- **hits**: Full pipeline match found in cache
- **partialHits**: Partial prefix match found
- **misses**: No match found, processed from scratch
- **sets**: Number of cache write operations
- **errors**: Cache operation errors (logged but don't block processing)

## Deployment Recommendations

### Development
```bash
PREPROCESSING_CACHE_BACKEND=memory
```
Simple, fast, no dependencies.

### Production (Single Replica)
```bash
PREPROCESSING_CACHE_BACKEND=memory
PREPROCESSING_CACHE_MAX_ITEMS=2000
```
Increase max items for better hit rate.

### Production (Multiple Replicas)
```bash
PREPROCESSING_CACHE_BACKEND=composite
PREPROCESSING_CACHE_REDIS_URL=redis://redis-service:6379
PREPROCESSING_CACHE_TTL_MS=1800000  # 30 minutes
PREPROCESSING_CACHE_COMPRESS=true
```
Best performance with cross-replica sharing.

## Future Extensions

The cache system is designed to support future enhancements:

### Redis + Object Storage (S3/MinIO)
For very large ePIs:
- Store metadata in Redis (keys, small objects)
- Store large payloads in object storage
- Reduces Redis memory usage

Implementation plan:
1. Create `ObjectStorageCache` class
2. Detect payload size threshold
3. Route large payloads to object storage
4. Keep Redis for indexing and small objects

### Commutative Preprocessing
If preprocessors are proven to be commutative (order-independent):
- Sort preprocessor names alphabetically for cache key
- Increases cache hit rate significantly
- Requires careful validation per preprocessor

Add configuration:
```bash
PREPROCESSING_CACHE_COMMUTATIVE=true
PREPROCESSING_CACHE_COMMUTATIVE_ALLOWLIST=annotator-svc,semantic-svc
```

## Monitoring

Monitor cache effectiveness:
1. Check hit rate: `hits / (hits + misses)`
2. Partial hit rate: `partialHits / (hits + misses)`
3. Error rate: `errors / (hits + misses + sets)`

Target metrics:
- Hit rate: >60% for production workloads
- Error rate: <1%

Log messages include:
- Cache hits/misses with matched steps
- Cache write operations
- Periodic statistics

## Troubleshooting

### Cache not working (all misses)
- Verify `PREPROCESSING_CACHE_BACKEND` is not `none`
- Check logs for cache initialization errors
- Verify Redis connectivity (if using `redis` or `composite`)

### High error rate
- Check Redis connection and health
- Verify network connectivity to Redis
- Review Redis memory limits and eviction policy

### Low hit rate
- Increase `PREPROCESSING_CACHE_TTL_MS`
- Increase `PREPROCESSING_CACHE_MAX_ITEMS` (memory cache)
- Verify ePIs are deterministic (same input = same hash)
- Check if preprocessing order varies

### Memory pressure
- Reduce `PREPROCESSING_CACHE_MAX_ITEMS`
- Switch from `memory` to `redis` or `composite`
- Enable compression: `PREPROCESSING_CACHE_COMPRESS=true`

## Code Structure

```
src/providers/cache/
├── IPreprocessingCache.ts    # Interface and types
├── utils.ts                   # Hashing and key generation
├── NoOpCache.ts              # Disabled cache
├── MemoryCache.ts            # LRU in-memory cache
├── RedisCache.ts             # Redis-based cache
├── CompositeCache.ts         # Two-level cache
└── CacheFactory.ts           # Factory and configuration
```

Integration point: `src/providers/preprocessing.provider.ts`
- `callServicesFromList()` method implements prefix matching and write-through caching
