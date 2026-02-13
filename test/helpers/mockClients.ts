import { IServiceClient } from '../../src/utils/IServiceClient';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Mock Service Client for testing
 * Implements IServiceClient to simulate k8s/Docker service discovery
 * Returns different service URLs based on the label selector
 * 
 * Usage:
 * const mockClient = new MockServiceClient();
 * 
 * // Returns lens service URLs
 * await mockClient.getServiceBaseUrlsByLabel('eu.gravitate-health.fosps.focusing=True');
 * 
 * // Returns preprocessor service URLs
 * await mockClient.getServiceBaseUrlsByLabel('eu.gravitate-health.fosps.preprocessing=True');
 * 
 * // For testing empty service discovery
 * const emptyClient = new MockServiceClient({ lensUrls: [], preprocessorUrls: [] });
 */
export class MockServiceClient implements IServiceClient {
  private lensUrls: string[];
  private preprocessorUrls: string[];

  constructor(config?: { lensUrls?: string[], preprocessorUrls?: string[] }) {
    this.lensUrls = config?.lensUrls ?? ['http://mock-lens-service.test'];
    this.preprocessorUrls = config?.preprocessorUrls ?? ['http://mock-preprocessing-service.test'];
  }

  async getServiceBaseUrlsByLabel(label: string): Promise<string[]> {
    // Check if label is for focusing/lens services
    if (label.includes('focusing') || label.includes('lens')) {
      return this.lensUrls;
    }
    // Check if label is for preprocessing services
    if (label.includes('preprocessing')) {
      return this.preprocessorUrls;
    }
    // Default: return empty array for unknown labels
    return [];
  }
}

/**
 * Mock FHIR Client
 * Provides access to mock FHIR servers (ePI, IPS, PV)
 * Does not implement IServiceClient since FHIR servers are not auto-discovered
 */
export class MockFhirClient {
  public readonly epiServerUrl: string;
  public readonly ipsServerUrl: string;
  public readonly pvServerUrl: string;

  constructor(
    epiServerUrl = 'http://mock-fhir-epi.test',
    ipsServerUrl = 'http://mock-fhir-ips.test',
    pvServerUrl = 'http://mock-profile.test'
  ) {
    this.epiServerUrl = epiServerUrl;
    this.ipsServerUrl = ipsServerUrl;
    this.pvServerUrl = pvServerUrl;
  }

  /**
   * Get the appropriate server URL based on resource type
   */
  getServerUrl(resourceType: 'epi' | 'ips' | 'pv'): string {
    switch (resourceType) {
      case 'epi':
        return this.epiServerUrl;
      case 'ips':
        return this.ipsServerUrl;
      case 'pv':
        return this.pvServerUrl;
    }
  }
}

/**
 * Load test fixture from file
 */
export function loadFixture(fixturePath: string): any {
  const fullPath = path.join(__dirname, '../fixtures', fixturePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  
  if (fixturePath.endsWith('.json')) {
    return JSON.parse(content);
  } else if (fixturePath.endsWith('.xml')) {
    return content;
  } else if (fixturePath.endsWith('.ttl')) {
    return content;
  }
  
  return content;
}

/**
 * Get ePI fixture by format
 */
export function getEpiFixture(format: 'json' | 'xml' | 'ttl' = 'json') {
  return loadFixture(`epi/epi.${format}`);
}

/**
 * Get IPS fixture by format
 */
export function getIpsFixture(format: 'json' | 'xml' | 'ttl' = 'json') {
  return loadFixture(`ips/ips.${format}`);
}

/**
 * Get PV fixture by format
 */
export function getPvFixture(format: 'json' | 'xml' | 'ttl' = 'json') {
  return loadFixture(`pv/pv.${format}`);
}

/**
 * Get lens fixture by name
 */
export function getLensFixture(lensName: 'pregnancy' | 'conditions') {
  return loadFixture(`lenses/${lensName}-lens.json`);
}

/**
 * Extract lens code from lens fixture
 */
export function extractLensCode(lensFixture: any): string {
  // Lenses are FHIR Library resources with code in content[0].data (base64-encoded)
  if (lensFixture.content && lensFixture.content.length > 0 && lensFixture.content[0].data) {
    return Buffer.from(lensFixture.content[0].data, 'base64').toString('utf-8');
  }
  return '';
}

/**
 * Create a mock FHIR server response
 */
export function createMockFhirResponse(resource: any) {
  return {
    status: 200,
    data: resource,
    headers: {
      'content-type': 'application/fhir+json',
    },
  };
}

/**
 * Extract ePI ID from fixture
 */
export function getEpiIdFromFixture(epiFixture: any): string {
  if (epiFixture.entry && epiFixture.entry.length > 0) {
    // Find Composition resource
    const composition = epiFixture.entry.find(
      (entry: any) => entry.resource?.resourceType === 'Composition'
    );
    return composition?.resource?.id || 'mock-epi-id';
  }
  return 'mock-epi-id';
}

/**
 * Extract patient identifier from IPS fixture
 */
export function getPatientIdFromIpsFixture(ipsFixture: any): string {
  if (ipsFixture.entry && ipsFixture.entry.length > 0) {
    const patient = ipsFixture.entry.find(
      (entry: any) => entry.resource?.resourceType === 'Patient'
    );
    return patient?.resource?.id || 'mock-patient-id';
  }
  return 'mock-patient-id';
}
