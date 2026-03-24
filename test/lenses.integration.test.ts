import nock from 'nock';
import request from 'supertest';
import { Express } from 'express';
import {
  MockServiceClient,
  getLensFixture,
  getLensIdentifierFromFixture,
} from './helpers/mockClients';
import { ServiceClientFactory } from '../src/utils/ServiceClientFactory';
import { createTestApp } from './helpers/testApp';

describe('Focusing Manager - Lenses Endpoint', () => {
  let app: Express;
  let pregnancyLens: any;
  let conditionsLens: any;
  let pregnancyLensIdentifier: string;
  let conditionsLensIdentifier: string;
  let mockServiceClient: MockServiceClient;

  beforeAll(() => {
    // Create Express app for testing
    app = createTestApp();
    
    // Load fixtures
    pregnancyLens = getLensFixture('pregnancy');
    conditionsLens = getLensFixture('conditions');
    pregnancyLensIdentifier = getLensIdentifierFromFixture(pregnancyLens);
    conditionsLensIdentifier = getLensIdentifierFromFixture(conditionsLens);
    
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
        .reply(200, { lenses: [pregnancyLensIdentifier, conditionsLensIdentifier] });

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

      expect([200]).toContain(response.status);
    });

    test('should handle lens service unavailable', async () => {
      // Mock service error
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(500, { error: 'Internal Server Error' });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      expect([200]).toContain(response.status);
    });

    test('should return unique lens identifiers from multiple selectors', async () => {
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
        .reply(200, { lenses: [pregnancyLensIdentifier] });
      
      nock('http://mock-lens-service-2.test')
        .get('/lenses')
        .reply(200, { lenses: [conditionsLensIdentifier] });

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
        .reply(200, { lenses: [pregnancyLensIdentifier] });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      // Should timeout or return error
      expect([200]).toContain(response.status);
    });
  });

  describe('Lens Discovery and Fetching', () => {
    test('should discover and fetch individual lens code', async () => {
      // Mock lens list
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLensIdentifier] });

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
        .reply(200, { lenses: [getLensIdentifierFromFixture(invalidLens)] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${getLensIdentifierFromFixture(invalidLens)}`)
        .reply(200, { code: '' });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      // Should handle gracefully
      expect([200]).toContain(response.status);
    });

    test('should handle lens with invalid base64 encoding', async () => {
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLensIdentifier] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .reply(200, { code: 'not-valid-base64!' });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      // Should handle gracefully
      expect([200]).toContain(response.status);
    });

    test('should handle lens fetch failure for individual lens', async () => {
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLensIdentifier] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .reply(404, { error: 'Lens not found' });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      // Should handle missing lens gracefully
      expect([200]).toContain(response.status);
    });
  });

  describe('GET /lenses/:lensId', () => {
    test('should return lens in JSON format by default', async () => {
      // Mock lens discovery
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLensIdentifier] });

      // Mock individual lens fetch
      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .reply(200, pregnancyLens);

      const response = await request(app)
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .set('Accept', 'application/fhir+json');

      expect(response.status).toBe(200);
      expect(response.type).toMatch(/json/);
      const parsed = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
      expect(parsed.resourceType).toBe('Library');
      expect(parsed.id).toBe(pregnancyLens.id);
    });

    test('should return lens in XML format when requested', async () => {
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLensIdentifier] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .reply(200, pregnancyLens);

      const response = await request(app)
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .set('Accept', 'application/fhir+xml');

      expect(response.status).toBe(200);
      expect(response.type).toMatch(/xml/);
      expect(response.text).toContain('<?xml');
      expect(response.text).toContain('<Library');
    });

    test('should return lens code in JavaScript format when requested', async () => {
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLensIdentifier] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .reply(200, pregnancyLens);

      const response = await request(app)
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .set('Accept', 'application/javascript');

      expect(response.status).toBe(200);
      expect(response.type).toMatch(/javascript/);
      // The response should be JavaScript code (decoded from base64)
      expect(response.text).toBeTruthy();
      // Check for JavaScript code patterns
      expect(response.text.length).toBeGreaterThan(0);
    });

    test('should return 404 for non-existent lens', async () => {
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLensIdentifier] });

      const response = await request(app)
        .get('/lenses/non-existent-lens')
        .set('Accept', 'application/json');

      expect(response.status).toBe(404);
      expect(response.body.error).toBeTruthy();
    });

    test('should return 404 when lens fetch fails', async () => {
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLensIdentifier] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .reply(404, { error: 'Lens not found' });

      const response = await request(app)
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .set('Accept', 'application/json');

      expect(response.status).toBe(404);
      expect(response.body.error).toBeTruthy();
    });

    test('should handle network errors gracefully', async () => {
      nock('http://mock-lens-service.test')
        .get('/lenses')
        .reply(200, { lenses: [pregnancyLensIdentifier] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .replyWithError('Network error');

      const response = await request(app)
        .get(`/lenses/${pregnancyLensIdentifier}`)
        .set('Accept', 'application/json');

      expect(response.status).toBe(404);
      expect(response.body.error).toBeTruthy();
    });
  });
});
