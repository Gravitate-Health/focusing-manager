# Focusing Manager Testing Suite

This directory contains comprehensive tests for the Focusing Manager service.

## Overview

The test suite covers:
- **Unit tests**: Individual helper functions and FHIR resource validation
- **Integration tests**: End-to-end focusing flows with various input combinations
- **Mock services**: Simulated external dependencies (FHIR servers, lens services, preprocessing services)

## Test Structure

```
test/
├── fixtures/          # Test data
│   ├── epi/          # Electronic Product Information (JSON, XML, TTL)
│   ├── ips/          # International Patient Summary (JSON, XML, TTL)
│   ├── pv/           # Persona Vector (JSON, XML, TTL)
│   └── lenses/       # Lens definitions (pregnancy, conditions)
├── helpers/          # Mock clients and utilities
│   └── mockClients.ts
├── focus.integration.test.ts  # Integration tests for focus endpoint
├── unit.test.ts      # Unit tests for individual functions
└── setup.ts          # Global test configuration
```

## Running Tests

### Run all tests
```bash
npm test
```

**Note**: Tests use `--forceExit` to ensure Jest terminates even if there are lingering async operations (like supertest's ephemeral servers). This is expected behavior and the warning message can be ignored.

### Run tests in watch mode (for development)
```bash
npm run test:watch
```

### Run with coverage report
```bash
npm run test:coverage
```

### Debug open handles (if needed)
```bash
npm run test:debug
```
This will show which async operations are keeping Jest alive. Useful for diagnosing test cleanup issues.

### Run specific test suites
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration
```

## Test Scenarios Covered

### 1. Resource Combination Tests
- ✅ **Implicit ePI + Implicit IPS + Implicit PV**
- ✅ **Referenced ePI by ID + Implicit IPS + Implicit PV**
- ✅ **Implicit ePI + Referenced IPS by patient ID + Implicit PV**
- ✅ **Implicit ePI + Implicit IPS + Referenced PV by ID**
- ✅ **Implicit ePI + Implicit IPS (no PV)**
- ✅ **Referenced ePI + Referenced IPS (no PV)**
- ✅ **All referenced (ePI ID + patient ID + PV ID)**

### 2. File Format Tests
- ✅ ePI in JSON, XML, and TTL formats
- ✅ PV in JSON, XML, and TTL formats
- ✅ IPS in JSON, XML, and TTL format

### 3. Lens Selection Tests
- ✅ Apply all lenses (default)
- ✅ Apply specific lens (e.g., pregnancy only)
- ✅ Apply multiple specific lenses (e.g., pregnancy + conditions)

### 4. Response Format Tests
- ✅ JSON response (`Accept: application/json`)
- ✅ HTML response (`Accept: text/html`)

### 5. Preprocessing Tests
- ✅ Skip preprocessing if ePI is already preprocessed (category "P")
- ✅ Run preprocessing if ePI is raw (category "R")
- ✅ Handle preprocessing errors gracefully

### 6. Error Handling Tests
- ✅ FHIR server errors (404, 500)
- ✅ Lens service errors
- ✅ Preprocessing service errors

### 7. Service Discovery Tests
- ✅ Mock Kubernetes/Docker service discovery
- ✅ Discover lens services by label
- ✅ Discover preprocessing services by label

## Test Fixtures

### ePI (Electronic Product Information)
- **Source**: HL7 EU Gravitate Health IG
- **ID**: `bundlepackageleaflet-en-dcaa4d32aa6658a8df831551503e52ee`
- **Formats**: JSON, XML, TTL
- **Content**: Product information leaflet with sections

### IPS (International Patient Summary)
- **Source**: Gravitate Health test examples
- **Patient**: Alicia (test patient)
- **Content**: Patient demographics, conditions, medications, allergies

### PV (Persona Vector)
- **Source**: HL7 EU Gravitate Health IG
- **ID**: `pedro-dimension-collection`
- **Formats**: JSON, XML, TTL
- **Content**: Patient dimensions and observations

### Lenses
- **Pregnancy Lens**: Highlights pregnancy-related information
- **Conditions Lens**: Highlights condition-specific information

## Mocking Strategy

The test suite uses **nock** to mock HTTP requests to external services:

```typescript
// Mock FHIR server
nock('http://mock-fhir-epi.test')
  .get('/Bundle/epi-id')
  .reply(200, epiFixture);

// Mock lens service
nock('http://mock-lens-service.test')
  .get('/lenses')
  .reply(200, [pregnancyLens, conditionsLens]);

// Mock preprocessing service
nock('http://mock-preprocessing-service.test')
  .post(/.*/)
  .reply(200, preprocessedEpi);
```

### MockServiceClient

A custom implementation of `IServiceClient` that simulates Kubernetes/Docker service discovery:

```typescript
const mockClient = new MockServiceClient();
await mockClient.getServiceBaseUrlsByLabel('focusing'); 
// Returns: ['http://mock-lens-service.test']
```

## Extending Tests

### Adding New Test Scenarios

1. Add test data to `test/fixtures/`
2. Create helper functions in `test/helpers/mockClients.ts`
3. Add test cases to relevant test file

### Adding New Mock Services

Implement mock responses in your test:

```typescript
nock('http://new-service.test')
  .get('/endpoint')
  .reply(200, { data: 'mock response' });
```

### Testing New Endpoints

Create a new test file following the pattern:

```typescript
describe('New Endpoint Tests', () => {
  beforeEach(() => {
    // Setup mocks
  });

  test('should handle new scenario', async () => {
    // Test implementation
  });
});
```

## Current Limitations

⚠️ **TODO Items**:
- [ ] Refactor `lensesController.ts` to export testable functions
- [ ] Add actual API endpoint calls (currently tests validate logic components)
- [ ] Add snapshot tests for HTML output
- [ ] Add performance tests for large ePIs
- [ ] Add tests for concurrent requests

## Integration with CI/CD

Add to your CI pipeline (GitHub Actions example):

```yaml
- name: Run tests
  run: npm test

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Troubleshooting

### Tests fail with "Cannot find module"
```bash
npm install
```

### Tests timeout
Increase timeout in jest.config.js:
```javascript
testTimeout: 60000 // 60 seconds
```

### Mock requests not matching
Check nock documentation: https://github.com/nock/nock

Enable nock debugging:
```typescript
nock.recorder.rec();
```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Nock Documentation](https://github.com/nock/nock)
- [Testing TypeScript](https://jestjs.io/docs/getting-started#via-ts-jest)
- [FHIR Specification](https://www.hl7.org/fhir/)

## Contributing

When adding new features to the Focusing Manager:
1. Write tests **before** implementing the feature (TDD approach)
2. Ensure all existing tests pass
3. Add integration tests for new endpoints
4. Update this README with new test scenarios
5. Aim for >80% code coverage
