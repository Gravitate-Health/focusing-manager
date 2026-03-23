import { createHash } from 'crypto';
import { PipelineStep } from './IPreprocessingCache';
import { Logger } from '../../utils/Logger';

/**
 * Recursively sort object keys for a deterministic JSON representation.
 * Arrays are preserved in their original order; only object key ordering is
 * normalised so that the same logical document always produces the same string
 * regardless of the key-insertion order used by the JSON parser.
 */
function sortObjectKeysRecursively(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeysRecursively);
    }
    if (obj !== null && typeof obj === 'object') {
        const sorted: any = {};
        Object.keys(obj).sort().forEach(key => {
            sorted[key] = sortObjectKeysRecursively(obj[key]);
        });
        return sorted;
    }
    return obj;
}

/**
 * Generate a deterministic hash for an ePI document
 * Uses the Composition.section content as the canonical representation
 */
export function generateEpiKey(epi: any): string {
    try {
        // Find Composition resource
        let composition = epi;
        if (epi.resourceType === "Bundle" && epi.entry && Array.isArray(epi.entry)) {
            const entry = epi.entry.find((e: any) => 
                e.resource && e.resource.resourceType === "Composition"
            );
            composition = entry ? entry.resource : null;
        }

        if (!composition || composition.resourceType !== "Composition") {
            throw new Error("Composition resource not found");
        }

        // Extract sections for hashing (these contain the content to be preprocessed)
        const sections = composition.section || [];
        
        // Create deterministic JSON string with recursively sorted keys.
        // NOTE: JSON.stringify(sections, Object.keys(sections).sort()) was the
        // previous implementation but it is incorrect: Object.keys() on an array
        // returns index strings ("0","1",...) which, when used as the replacer
        // whitelist, filter OUT all real section properties ("title","text",…)
        // because none of them are named "0" or "1". Every section therefore
        // serialised as {} and all ePIs with the same section count produced the
        // same hash, causing unrelated ePIs to share a cache entry.
        const canonical = JSON.stringify(sortObjectKeysRecursively(sections));
        
        // Generate SHA-256 hash
        const hash = createHash('sha256').update(canonical).digest('hex');
        
        return hash;
    } catch (error) {
        Logger.logError('cache/utils.ts', 'generateEpiKey', `Failed to generate ePI key: ${error}`);
        // Fallback: hash entire document
        const canonical = JSON.stringify(epi);
        return createHash('sha256').update(canonical).digest('hex');
    }
}

/**
 * Generate cache key for a specific pipeline prefix
 * Format: {schemaVersion}:{epiKey}:{pipelineSignature}
 */
export function generateCacheKey(
    epiKey: string, 
    steps: PipelineStep[], 
    schemaVersion: string = '1'
): string {
    const pipelineSignature = steps
        .map(step => {
            const parts = [step.name];
            if (step.version) parts.push(step.version);
            if (step.configHash) parts.push(step.configHash);
            return parts.join(':');
        })
        .join('|');
    
    return `${schemaVersion}:${epiKey}:${pipelineSignature}`;
}

/**
 * Generate pattern for scanning all cache entries for an ePI
 */
export function generateEpiPattern(epiKey: string, schemaVersion: string = '1'): string {
    return `${schemaVersion}:${epiKey}:*`;
}

/**
 * Compress JSON string using gzip (for storage optimization)
 */
export async function compressJson(data: any): Promise<Buffer> {
    const { gzip } = await import('zlib');
    const { promisify } = await import('util');
    const gzipAsync = promisify(gzip);
    
    const json = JSON.stringify(data);
    return gzipAsync(Buffer.from(json, 'utf-8'));
}

/**
 * Decompress gzipped JSON string
 */
export async function decompressJson(buffer: Buffer): Promise<any> {
    const { gunzip } = await import('zlib');
    const { promisify } = await import('util');
    const gunzipAsync = promisify(gunzip);
    
    const decompressed = await gunzipAsync(buffer);
    return JSON.parse(decompressed.toString('utf-8'));
}

/**
 * Convert PipelineStep array to a comparable signature
 */
export function pipelineToSignature(steps: PipelineStep[]): string {
    return steps
        .map(s => `${s.name}${s.version ? '@' + s.version : ''}${s.configHash ? '#' + s.configHash : ''}`)
        .join('->');
}
