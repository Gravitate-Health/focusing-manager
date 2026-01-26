import { createHash } from 'crypto';
import { PipelineStep } from './IPreprocessingCache';
import { Logger } from '../../utils/Logger';

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
        
        // Create deterministic JSON string (sorted keys, no whitespace)
        const canonical = JSON.stringify(sections, Object.keys(sections).sort());
        
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
