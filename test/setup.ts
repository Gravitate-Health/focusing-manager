// Global test setup
// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.ENVIRONMENT = 'dev';
process.env.FHIR_EPI_URL = 'http://mock-fhir-epi.test';
process.env.FHIR_IPS_URL = 'http://mock-fhir-ips.test';
process.env.PROFILE_URL = 'http://mock-profile.test';
process.env.SERVER_PORT = '3001';

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
