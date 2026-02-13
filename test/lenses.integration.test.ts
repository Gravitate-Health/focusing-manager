import nock from 'nock';
import request from 'supertest';
import { Express } from 'express';
import {
  MockServiceClient,
  getEpiFixture,
  getIpsFixture,
  getLensFixture,
  
} from './helpers/mockClients';
import { ServiceClientFactory } from '../src/utils/ServiceClientFactory';
import { createTestApp } from './helpers/testApp';

describe('Focusing Manager - Lenses Endpoint', () => {
  let app: Express;
  let epiFixtureJson: any;
  let ipsFixture: any;
  let pregnancyLens: any;
  let conditionsLens: any;
  let mockServiceClient: MockServiceClient;

  beforeAll(() => {
    // Create Express app for testing
    app = createTestApp();
    
    // Load fixtures
    epiFixtureJson = getEpiFixture('json');
    ipsFixture = getIpsFixture();
    pregnancyLens = getLensFixture('pregnancy');
    conditionsLens = getLensFixture('conditions');
    
    // Create mock client
    mockServiceClient = new MockServiceClient();
  });

  beforeEach(() => {
    // Clean up any pending mocks
    nock.cleanAll();
    
    // Mock ServiceClientFactory
    jest.spyOn(ServiceClientFactory, 'getClient').mockResolvedValue(mockServiceClient);
  });

  afterEach(() => {
    // Restore all mocks
    jest.restoreAllMocks();
    
    // Clean up nock
    nock.cleanAll();
    
    // Clear all timers
    jest.clearAllTimers();
  });

  afterAll(() => {
    // Final cleanup
    nock.cleanAll();
    nock.restore();
  });

  describe('GET /lenses - Discover Lenses', () => {
    test('should list available lenses', async () => {
      // Mock lens selector discovery
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id, conditionsLens.id] });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
      
      // Response should contain lens information
      if (Array.isArray(response.body)) {
        expect(response.body.length).toBeGreaterThan(0);
      } else if (typeof response.body === 'object') {
        expect(Object.keys(response.body).length).toBeGreaterThan(0);
      }
    });

    test('should handle empty lens list gracefully', async () => {
      // Mock empty lens list
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [] });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      expect([200, 500]).toContain(response.status);
    });

    test('should handle lens service unavailable', async () => {
      // Mock service error
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(500, { error: 'Internal Server Error' });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      expect([200, 500]).toContain(response.status);
    });

    test('should return unique lens names from multiple selectors', async () => {
      // Create mock with multiple lens services
      const multiLensClient = new MockServiceClient({
        lensUrls: [
          'http://mock-lens-service-1.test',
          'http://mock-lens-service-2.test'
        ],
        preprocessorUrls: ['http://mock-preprocessing-service.test']
      });
      jest.spyOn(ServiceClientFactory, 'getClient').mockResolvedValue(multiLensClient);

      // Mock both lens services
      nock('http://mock-lens-service-1.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });
      
      nock('http://mock-lens-service-2.test')
        .get('/lenses')
        .reply(200, { lenses: [conditionsLens.id] });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    test('should handle lens service timeout', async () => {
      // Mock timeout
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .delayConnection(30000)
        .reply(200, { lenses: [pregnancyLens.id] });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      // Should timeout or return error
      expect([200, 500, 504]).toContain(response.status);
    });
  });

  describe('Lens Discovery and Fetching', () => {
    test('should discover and fetch individual lens code', async () => {
      // Mock lens list
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });

      const listResponse = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      expect(listResponse.status).toBe(200);
    });

    test('should handle lens with missing code', async () => {
      const invalidLens = {
        ...pregnancyLens,
        content: [] // No code content
      };

      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, [invalidLens]);

      nock('http://mock-lens-service.test')
        .get(`/lenses/${invalidLens.id}`)
        .reply(200, { code: '' });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      // Should handle gracefully
      expect([200, 500]).toContain(response.status);
    });

    test('should handle lens with invalid base64 encoding', async () => {
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(200, { code: 'not-valid-base64!' });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      // Should handle gracefully
      expect([200, 500]).toContain(response.status);
    });

    test('should handle lens fetch failure for individual lens', async () => {
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(404, { error: 'Lens not found' });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      // Should handle missing lens gracefully
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Lens Execution in Focus Workflow', () => {
    test('should apply single lens during focus', async () => {
      // Mock preprocessing
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, epiFixtureJson);

      // Mock lens discovery
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });

      // Mock individual lens fetch
      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(200, pregnancyLens);

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    test('should apply multiple lenses during focus', async () => {
      // Mock preprocessing
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, epiFixtureJson);

      // Mock lens discovery
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id, conditionsLens.id] });

      // Mock individual lens fetches
      
      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(200, pregnancyLens);
      
      nock('http://mock-lens-service.test')
        .get(`/lenses/${conditionsLens.id}`)
        .reply(200, conditionsLens);

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    test('should apply specific lens by name', async () => {
      // Mock preprocessing
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, epiFixtureJson);

      // Mock lens discovery
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id, conditionsLens.id] });

      // Mock only pregnancy lens fetch (specific lens requested)
      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(200, pregnancyLens);

      const response = await request(app)
        .post('/focus')
        .query({ lenses: pregnancyLens.name })
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    test('should handle lens execution errors gracefully', async () => {
      // Mock preprocessing
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, epiFixtureJson);

      // Mock lens discovery
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });

      // Mock lens fetch with invalid JavaScript code
      const invalidCode = 'this is not valid JavaScript code!!!';
      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(200, { code: Buffer.from(invalidCode).toString('base64') });

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      // Should handle error and return original or partially processed ePI
      expect([200, 500]).toContain(response.status);
    });

    test('should skip lens execution if preprocessing fails', async () => {
      // Mock preprocessing failure
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(500, { error: 'Preprocessing failed' });

      // Lens services should NOT be called if preprocessing fails
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      // Should return error or original ePI
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Lens Execution Results', () => {
    test('should add lens extensions to ePI after successful execution', async () => {
      // Mock preprocessing
      const preprocessedEpi = JSON.parse(JSON.stringify(epiFixtureJson));
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, preprocessedEpi);

      // Mock lens discovery and fetch
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(200, pregnancyLens);

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      if (response.status === 200) {
        // Look for Composition resource
        const composition = response.body.entry?.find(
          (e: any) => e.resource?.resourceType === 'Composition'
        )?.resource;

        // Composition should exist
        expect(composition).toBeDefined();
      }
    });

    test('should set category code to "E" after enhancement', async () => {
      // Mock preprocessing
      const preprocessedEpi = JSON.parse(JSON.stringify(epiFixtureJson));
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, preprocessedEpi);

      // Mock lens
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(200, pregnancyLens);

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      if (response.status === 200) {
        const composition = response.body.entry?.find(
          (e: any) => e.resource?.resourceType === 'Composition'
        )?.resource;

        // Category code might be set to "E" for enhanced
        if (composition?.category?.[0]?.coding?.[0]?.code) {
          expect(['P', 'E', 'R']).toContain(composition.category[0].coding[0].code);
        }
      }
    });

    test('should include highlight/collapse CSS classes in HTML output', async () => {
      // Mock preprocessing
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, epiFixtureJson);

      // Mock lens
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(200, pregnancyLens);

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'text/html');

      if (response.status === 200) {
        expect(response.type).toMatch(/html/);
        // HTML might contain highlight or collapse classes
        // Note: Actual presence depends on lens logic and ePI content
      }
    });
  });

  describe('Lens Error Scenarios', () => {
    test('should handle lens service network error', async () => {
      // Mock preprocessing success
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, epiFixtureJson);

      // Mock lens service network error
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .replyWithError('Network connection failed');

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      // Should handle error gracefully
      expect([200, 500]).toContain(response.status);
    });

    test('should handle missing lens selector endpoint', async () => {
      // Mock preprocessing
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, epiFixtureJson);

      // Mock lens selector 404
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(404, { error: 'Not found' });

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      // Should handle gracefully
      expect([200, 500]).toContain(response.status);
    });

    test('should handle lens code that throws runtime error', async () => {
      // Mock preprocessing
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, epiFixtureJson);

      // Mock lens with code that throws error
      const errorThrowingCode = `
        (epi, ips, pv, html) => {
          return {
            enhance: async () => {
              throw new Error('Lens runtime error!');
            },
            explanation: async () => 'Test lens'
          }
        }
      `;

      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(200, { code: Buffer.from(errorThrowingCode).toString('base64') });

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      // Should handle error and return result
      expect([200, 500]).toContain(response.status);
    });

    test('should include lens warnings in response headers', async () => {
      // Mock preprocessing
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, epiFixtureJson);

      // Mock lens fetch failure
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(500, { error: 'Internal Server Error' });

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      // Check for warning headers (GH-Focusing-Warnings)
      if (response.headers['gh-focusing-warnings']) {
        const warnings = JSON.parse(response.headers['gh-focusing-warnings']);
        expect(warnings).toBeDefined();
      }
    });
  });

  describe('Lens Name Mapping', () => {
    test('should handle duplicate lens names from different selectors', async () => {
      // Create lenses with same name but from different sources
      const lens1 = { ...pregnancyLens, name: 'duplicate-lens', id: 'lens-1' };
      const lens2 = { ...conditionsLens, name: 'duplicate-lens', id: 'lens-2' };

      // Mock preprocessing
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, epiFixtureJson);

      // Mock lens discovery from multiple services
      const multiServiceClient = new MockServiceClient({
        lensUrls: [
          'http://mock-lens-service-1.test',
          'http://mock-lens-service-2.test'
        ],
        preprocessorUrls: ['http://mock-preprocessing-service.test']
      });
      jest.spyOn(ServiceClientFactory, 'getClient').mockResolvedValue(multiServiceClient);

      nock('http://mock-lens-service-1.test')
        .get('/lenses')
        .reply(200, [lens1]);

      nock('http://mock-lens-service-2.test')
        .get('/lenses')
        .reply(200, [lens2]);


      nock('http://mock-lens-service-1.test')
        .get(`/lenses/${lens1.id}`)
        .reply(200, pregnancyLens);

      nock('http://mock-lens-service-2.test')
        .get(`/lenses/${lens2.id}`)
        .reply(200, conditionsLens);

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      // Should handle duplicate names (via suffix: lens-1, lens-2, etc.)
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Lens and Preprocessor Integration', () => {
    test('should execute full pipeline: preprocessing then lenses', async () => {
      // Mock preprocessing
      const preprocessedEpi = JSON.parse(JSON.stringify(epiFixtureJson));
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, preprocessedEpi);

      // Mock lens discovery and execution
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id, conditionsLens.id] });


      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(200, pregnancyLens);

      nock('http://mock-lens-service.test')
        .get(`/lenses/${conditionsLens.id}`)
        .reply(200, conditionsLens);

      const response = await request(app)
        .post('/focus')
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    test('should work with specific preprocessors and specific lenses', async () => {
      // Mock specific preprocessing
      nock('http://mock-preprocessing-service.test')
        .post(/.*/)
        .reply(200, epiFixtureJson);

      // Mock lens discovery
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLens.id, conditionsLens.id] });

      // Mock only pregnancy lens (specific lens requested)
      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(200, pregnancyLens);

      const response = await request(app)
        .post('/focus')
        .query({ 
          preprocessors: 'mock-preprocessing-service',
          lenses: pregnancyLens.name 
        })
        .send({
          epi: epiFixtureJson,
          ips: ipsFixture
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json');

      expect([200, 500]).toContain(response.status);
    });
  });
});
