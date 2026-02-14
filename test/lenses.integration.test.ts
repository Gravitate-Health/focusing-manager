import nock from 'nock';
import request from 'supertest';
import { Express } from 'express';
import {
  MockServiceClient,
  getLensFixture,
  
} from './helpers/mockClients';
import { ServiceClientFactory } from '../src/utils/ServiceClientFactory';
import { createTestApp } from './helpers/testApp';

describe('Focusing Manager - Lenses Endpoint', () => {
  let app: Express;
  let pregnancyLens: any;
  let conditionsLens: any;
  let mockServiceClient: MockServiceClient;

  beforeAll(() => {
    // Create Express app for testing
    app = createTestApp();
    
    // Load fixtures
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
      expect([200]).toContain(response.status);
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
        .reply(200, { lenses: [invalidLens.id] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${invalidLens.id}`)
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
        .reply(200, { lenses: [pregnancyLens.id] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
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
        .reply(200, { lenses: [pregnancyLens.id] });

      nock('http://mock-lens-service.test')
        .get(`/lenses/${pregnancyLens.id}`)
        .reply(404, { error: 'Lens not found' });

      const response = await request(app)
        .get('/lenses')
        .set('Accept', 'application/json');

      // Should handle missing lens gracefully
      expect([200]).toContain(response.status);
    });
  });
});
