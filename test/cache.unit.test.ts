/**
 * Cache Unit Tests
 *
 * Tests covering two bugs reported as "different ePI IDs returning the same result":
 *
 * Bug 1 - generateEpiKey hash collision:
 *   JSON.stringify(sections, Object.keys(sections).sort()) uses array index strings
 *   ("0","1",...) as the replacer whitelist. Section objects contain properties like
 *   "title", "text", "code" — none of which are named "0" or "1" — so every section
 *   serialises as {}.  All ePIs with the same number of sections therefore produce an
 *   identical SHA-256 hash and share the same cache entry.
 *
 * Bug 2 - MemoryCache returns a mutable reference:
 *   MemoryCache.get() returns entry.value directly.  When the lens-execution
 *   environment mutates the returned ePI object (adding extensions, updating category
 *   codes), it silently corrupts the cached entry. Subsequent requests then receive
 *   the already-lens-modified ePI from the cache.
 */

import { generateEpiKey } from '../src/providers/cache/utils';
import { MemoryCache } from '../src/providers/cache/MemoryCache';
import { PipelineStep } from '../src/providers/cache/IPreprocessingCache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid ePI bundle with unique section content. */
function makeEpi(options: {
  bundleId: string;
  compositionId: string;
  sectionTitle: string;
  sectionHtml: string;
}): any {
  return {
    resourceType: 'Bundle',
    id: options.bundleId,
    type: 'document',
    entry: [
      {
        fullUrl: `http://example.org/Composition/${options.compositionId}`,
        resource: {
          resourceType: 'Composition',
          id: options.compositionId,
          status: 'final',
          type: { coding: [{ system: 'https://spor.ema.europa.eu/rmswi/', code: '100000155538' }] },
          category: [
            {
              coding: [
                {
                  system: 'http://hl7.eu/fhir/ig/gravitate-health/CodeSystem/epicategory-cs',
                  code: 'R',
                  display: 'Raw',
                },
              ],
            },
          ],
          title: `ePI - ${options.bundleId}`,
          date: '2023-01-01T00:00:00Z',
          author: [{ reference: 'Organization/test-org' }],
          section: [
            {
              title: options.sectionTitle,
              code: {
                coding: [{ system: 'https://spor.ema.europa.eu/rmswi/', code: '100000155538' }],
                text: options.sectionTitle,
              },
              text: {
                status: 'additional',
                div: options.sectionHtml,
              },
            },
          ],
        },
      },
    ],
  };
}

const EPI_A = makeEpi({
  bundleId: 'bundle-epi-a',
  compositionId: 'comp-epi-a',
  sectionTitle: 'Indications for Drug A',
  sectionHtml: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Drug A is used to treat condition X.</p></div>',
});

const EPI_B = makeEpi({
  bundleId: 'bundle-epi-b',
  compositionId: 'comp-epi-b',
  sectionTitle: 'Indications for Drug B',
  sectionHtml: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Drug B is used to treat condition Y.</p></div>',
});

// Same structure as EPI_A but different IDs (as if fetched via reference vs inline)
const EPI_A_REFERENCE = makeEpi({
  bundleId: 'bundle-epi-a',          // same bundle id
  compositionId: 'comp-epi-a',       // same composition id
  sectionTitle: 'Indications for Drug A',
  sectionHtml: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Drug A is used to treat condition X.</p></div>',
});

const PIPELINE_STEPS: PipelineStep[] = [{ name: 'preprocessor-alpha' }];

// ---------------------------------------------------------------------------
// Bug 1: generateEpiKey hash collision
// ---------------------------------------------------------------------------

describe('Bug 1 – generateEpiKey: hash collision due to broken JSON.stringify replacer', () => {
  test('two ePIs with identical section count but different content must NOT produce the same key', () => {
    // EPI_A and EPI_B both have exactly one section.
    // The buggy implementation collapses every section to {} so both hash to the same SHA-256.
    const keyA = generateEpiKey(EPI_A);
    const keyB = generateEpiKey(EPI_B);

    expect(keyA).not.toBe(keyB);
  });

  test('same ePI fetched via reference (by ID) and provided inline must produce the SAME key', () => {
    // These two objects are structurally identical — the cache SHOULD share an entry.
    const keyInline = generateEpiKey(EPI_A);
    const keyReference = generateEpiKey(EPI_A_REFERENCE);

    expect(keyInline).toBe(keyReference);
  });

  test('each distinct ePI has a unique, stable hash', () => {
    const epiC = makeEpi({
      bundleId: 'bundle-epi-c',
      compositionId: 'comp-epi-c',
      sectionTitle: 'Dosage Information',
      sectionHtml: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Take 10 mg daily.</p></div>',
    });
    const epiD = makeEpi({
      bundleId: 'bundle-epi-d',
      compositionId: 'comp-epi-d',
      sectionTitle: 'Contraindications',
      sectionHtml: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Do not use if allergic.</p></div>',
    });

    const keys = [EPI_A, EPI_B, epiC, epiD].map(generateEpiKey);
    const uniqueKeys = new Set(keys);

    expect(uniqueKeys.size).toBe(4); // all four must be distinct
  });

  test('key is a 64-character hex string (SHA-256)', () => {
    const key = generateEpiKey(EPI_A);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  test('hashing a multi-section ePI does not collide with a differently-structured ePI', () => {
    const epiTwoSections = {
      ...EPI_A,
      entry: EPI_A.entry.map((e: any) =>
        e.resource.resourceType === 'Composition'
          ? {
              ...e,
              resource: {
                ...e.resource,
                section: [
                  ...e.resource.section,
                  {
                    title: 'Second section',
                    text: {
                      status: 'additional',
                      div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Extra section content.</p></div>',
                    },
                  },
                ],
              },
            }
          : e,
      ),
    };

    const keyOneSect = generateEpiKey(EPI_A);
    const keyTwoSect = generateEpiKey(epiTwoSections);

    expect(keyOneSect).not.toBe(keyTwoSect);
  });
});

// ---------------------------------------------------------------------------
// Bug 2: MemoryCache returns a mutable reference
// ---------------------------------------------------------------------------

describe('Bug 2 – MemoryCache: returned value must be a deep copy, not a mutable reference', () => {
  test('mutating a cache-hit value must NOT corrupt the cached entry', async () => {
    const cache = new MemoryCache();
    const epiKey = generateEpiKey(EPI_A);

    // Store the preprocessed ePI
    await cache.set(epiKey, PIPELINE_STEPS, EPI_A);

    // Retrieve it
    const hit1 = await cache.get(epiKey, PIPELINE_STEPS);
    expect(hit1).not.toBeNull();

    // Simulate what the Lens Execution Environment does: mutate the returned object
    // (e.g. mark the ePI as enhanced, add extensions, change category code)
    const returnedEpi = hit1!.value;
    const composition = returnedEpi.entry.find(
      (e: any) => e.resource?.resourceType === 'Composition',
    )?.resource;
    composition.category[0].coding[0].code = 'E';  // "E" = Enhanced
    if (!composition.extension) composition.extension = [];
    composition.extension.push({
      url: 'http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/LensesApplied',
      valueString: 'pregnancy-lens',
    });

    // Retrieve from cache a second time — must still have the ORIGINAL (pre-lens) state
    const hit2 = await cache.get(epiKey, PIPELINE_STEPS);
    expect(hit2).not.toBeNull();

    const cachedComposition = hit2!.value.entry.find(
      (e: any) => e.resource?.resourceType === 'Composition',
    )?.resource;

    // Category must still be "R" (Raw), not "E" (Enhanced)
    expect(cachedComposition.category[0].coding[0].code).toBe('R');

    // No lens extensions should have been written back into the cache
    const lensExt = (cachedComposition.extension || []).find(
      (ext: any) =>
        ext.url === 'http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/LensesApplied',
    );
    expect(lensExt).toBeUndefined();
  });

  test('two concurrent requests for the same ePI each receive an independent copy', async () => {
    const cache = new MemoryCache();
    const epiKey = generateEpiKey(EPI_B);

    await cache.set(epiKey, PIPELINE_STEPS, EPI_B);

    const [hit1, hit2] = await Promise.all([
      cache.get(epiKey, PIPELINE_STEPS),
      cache.get(epiKey, PIPELINE_STEPS),
    ]);

    expect(hit1).not.toBeNull();
    expect(hit2).not.toBeNull();

    // Mutate the object from the first hit
    hit1!.value.entry[0].resource.category[0].coding[0].code = 'E';

    // The second hit must be unaffected
    expect(hit2!.value.entry[0].resource.category[0].coding[0].code).toBe('R');

    // And the next cache read must still be "R"
    const hit3 = await cache.get(epiKey, PIPELINE_STEPS);
    expect(hit3!.value.entry[0].resource.category[0].coding[0].code).toBe('R');
  });

  test('partial-hit returned value is also a deep copy', async () => {
    const cache = new MemoryCache();
    const epiKey = generateEpiKey(EPI_A);
    const twoSteps: PipelineStep[] = [
      { name: 'preprocessor-alpha' },
      { name: 'preprocessor-beta' },
    ];

    // Cache result of only the first step
    await cache.set(epiKey, twoSteps.slice(0, 1), EPI_A);

    // Ask for both steps — should get partial hit (1 of 2)
    const partialHit = await cache.get(epiKey, twoSteps);
    expect(partialHit).not.toBeNull();
    expect(partialHit!.matchedSteps).toBe(1);

    // Mutate returned value
    partialHit!.value.entry[0].resource.category[0].coding[0].code = 'E';

    // Cache should be unchanged
    const nextHit = await cache.get(epiKey, twoSteps.slice(0, 1));
    expect(nextHit!.value.entry[0].resource.category[0].coding[0].code).toBe('R');
  });
});

// ---------------------------------------------------------------------------
// Bug 1 + 2 combined: end-to-end cache isolation between two ePIs
// ---------------------------------------------------------------------------

describe('Combined – ePIs must not share cache entries (Bug 1 + 2 together)', () => {
  test('preprocessing result for ePI-A must not be served for ePI-B request', async () => {
    const cache = new MemoryCache();

    const preprocessedA = JSON.parse(JSON.stringify(EPI_A));
    const compositionA = preprocessedA.entry.find(
      (e: any) => e.resource?.resourceType === 'Composition',
    )?.resource;
    compositionA.category[0].coding[0].code = 'P'; // mark as preprocessed
    compositionA._preprocessedBy = 'preprocessor-alpha';

    const preprocessedB = JSON.parse(JSON.stringify(EPI_B));
    const compositionB = preprocessedB.entry.find(
      (e: any) => e.resource?.resourceType === 'Composition',
    )?.resource;
    compositionB.category[0].coding[0].code = 'P';
    compositionB._preprocessedBy = 'preprocessor-alpha';

    const keyA = generateEpiKey(EPI_A);
    const keyB = generateEpiKey(EPI_B);

    // Keys must differ so cache entries are isolated
    expect(keyA).not.toBe(keyB);

    await cache.set(keyA, PIPELINE_STEPS, preprocessedA);
    await cache.set(keyB, PIPELINE_STEPS, preprocessedB);

    const hitA = await cache.get(keyA, PIPELINE_STEPS);
    const hitB = await cache.get(keyB, PIPELINE_STEPS);

    expect(hitA).not.toBeNull();
    expect(hitB).not.toBeNull();

    // Each hit must return the correct ePI, not the other one
    const resultCompositionA = hitA!.value.entry.find(
      (e: any) => e.resource?.resourceType === 'Composition',
    )?.resource;
    const resultCompositionB = hitB!.value.entry.find(
      (e: any) => e.resource?.resourceType === 'Composition',
    )?.resource;

    expect(resultCompositionA._preprocessedBy).toBe('preprocessor-alpha');
    expect(resultCompositionB._preprocessedBy).toBe('preprocessor-alpha');

    // Composition IDs must differ — each hit returns its own ePI
    expect(resultCompositionA.id).toBe('comp-epi-a');
    expect(resultCompositionB.id).toBe('comp-epi-b');
  });

  test('cache miss for unknown ePI key returns null (no cross-contamination via fallback)', async () => {
    const cache = new MemoryCache();
    const keyA = generateEpiKey(EPI_A);
    const keyB = generateEpiKey(EPI_B);

    // Only populate ePI-A
    await cache.set(keyA, PIPELINE_STEPS, EPI_A);

    // Request for ePI-B must be a MISS, not a hit returning ePI-A
    const hitB = await cache.get(keyB, PIPELINE_STEPS);
    expect(hitB).toBeNull();
  });
});
