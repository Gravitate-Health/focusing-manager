# Focusing Manager - AI Coding Agent Instructions

## Project Overview

**Focusing Manager** is a TypeScript/Express service that orchestrates the "focusing" of electronic Product Information (ePI) documents based on patient-specific International Patient Summary (IPS) data. It's part of the Gravitate-Health FOSPS (Focused electronic Product information System).

### Core Architecture

The service follows a **multi-stage pipeline pattern**:
1. **Preprocessing**: Adds semantic annotations to ePI leaflet sections via external preprocessor services
2. **Lens Application**: Dynamically executes JavaScript "lenses" that highlight/collapse HTML content based on patient data
3. **Response Formatting**: Returns enhanced ePIs as JSON or HTML with CSS classes (`highlight`, `collapse`)

### Key Design Patterns

**Service Discovery Pattern**: Uses abstraction layer (`ServiceClientFactory`) to discover preprocessing/lens services from:
- Kubernetes cluster (production: label-based service discovery via `@kubernetes/client-node`)
- Docker containers (standalone: via Docker API)
- External endpoints (via `PREPROCESSING_EXTERNAL_ENDPOINTS` env var)

**Provider Pattern**: All external integrations use provider classes (`src/providers/`) that extend `AxiosController` base class.

**Dynamic Code Execution**: Lenses are fetched as base64-encoded JavaScript strings, decoded, and executed via `new Function()` to manipulate HTML content.

## Environment Configuration

Critical environment variables (set in `.env` or deployment manifest):

```bash
# Required
FHIR_EPI_URL=<ePI FHIR server URL>
FHIR_IPS_URL=<IPS FHIR server URL>

# Service discovery
ENVIRONMENT=production|standalone|dev  # Controls k8s vs Docker vs local dev
FOCUSING_LABEL_SELECTOR=eu.gravitate-health.fosps.focusing=True
PREPROCESSING_LABEL_SELECTOR=eu.gravitate-health.fosps.preprocessing=True
PREPROCESSING_EXTERNAL_ENDPOINTS=http://preprocessor1.example.com:8080,http://preprocessor2.example.com:9090  # Optional, comma-separated

# Optional
PROFILE_URL=<Persona Vector FHIR server>
SERVER_PORT=3000
```

For **local dev outside cluster**, set `ENVIRONMENT=dev` plus: `CLUSTER_NAME`, `CLUSTER_SERVER`, `CLUSTER_CADATA`, `USER_NAME`, `USER_TOKEN`, `CONTEXT_NAME`.

## Development Workflow

### Build & Run Commands

```bash
npm install                  # Install dependencies
npm run dev                  # Dev mode with hot reload (ts-node-dev)
npm run build               # Compile TypeScript to build/ (copies templates/)
npm start                   # Production mode (runs build/index.js)
```

Build process: TypeScript compiles `src/` → `build/`, then copies `src/templates/` → `build/templates/` (contains Liquid templates for HTML rendering).

### Testing

The project uses **Jest** with **nock** for HTTP mocking and **supertest** for API endpoint testing. Test coverage includes unit tests and comprehensive integration tests.

#### Test Structure

```
test/
├── focus.integration.test.ts          # 36 tests - Complete focus endpoint scenarios
├── preprocessing.integration.test.ts  # 19 tests - Preprocessing & cache functionality
├── lenses.integration.test.ts         # 24 tests - Lens discovery & execution
├── helpers/
│   ├── mockClients.ts                # Mock service clients & FHIR clients
│   └── testApp.ts                    # Express app configuration for tests
├── fixtures/                         # Test data (ePI, IPS, PV, lenses)
└── setup.ts                          # Jest global setup

Total: 79 tests covering all major workflows
```

#### Running Tests

```bash
npm test                               # Run all tests
npm test -- focus.integration.test.ts  # Run specific test file
npm test -- --coverage                 # Run with coverage report
npm test -- --detectOpenHandles        # Debug hanging tests
```

#### Test Coverage

**Focus Integration Tests (`focus.integration.test.ts`)** - 36 tests:
- ✅ **Resource Combinations**: ePI, IPS, PV in various combinations (implicit/referenced)
- ✅ **Format Support**: JSON, XML, TTL for all FHIR resources
- ✅ **Lens Selection**: Specific lens filtering, multiple lenses
- ✅ **Error Handling**: 10 edge cases for resource not found (404), network timeouts, invalid responses
  - ePI ID not found
  - Patient ID not found (IPS)
  - PV ID not found
  - Lens ID not found
  - Multiple resources not found
  - Malformed IDs (security: path traversal attempts)
  - Empty IDs
  - Network timeouts
  - Invalid JSON responses
- ✅ **Response Formats**: JSON and HTML rendering
- ✅ **Preprocessing**: Category-based preprocessing (Raw "R" vs Preprocessed "P")
- ✅ **Service Discovery**: Lens and preprocessor service discovery

**Preprocessing Integration Tests (`preprocessing.integration.test.ts`)** - 19 tests:
- ✅ **Service Discovery**: GET /preprocessing endpoint
- ✅ **Execution**: POST /preprocessing/:epiId with various scenarios
- ✅ **Cache Functionality**: Comprehensive cache behavior testing
  - Cache misses (no cached data)
  - Cache hits (full cached data)
  - Partial cache hits (some preprocessors cached)
  - Cache stats endpoint (GET /preprocessing/cache/stats)
  - Cache prefix matching
  - LRU eviction behavior
- ✅ **Error Handling**: Invalid ePI IDs, network errors, service failures
- ✅ **Multiple Preprocessors**: Parallel execution and aggregation

**Lenses Integration Tests (`lenses.integration.test.ts`)** - 24 tests:
- ✅ **Discovery**: GET /lenses endpoint with multiple selectors
- ✅ **Fetching**: Individual lens retrieval (LEE handles base64 decoding)
- ✅ **Execution**: Lens application in complete focus workflow
- ✅ **Error Scenarios**: Network errors, invalid lens code, runtime errors
- ✅ **Name Mapping**: Handling duplicate lens names across selectors
- ✅ **Integration**: Full pipeline with preprocessing + lens execution

#### Test Infrastructure

**Mock Clients** (`test/helpers/mockClients.ts`):
- `MockServiceClient`: Simulates k8s/Docker service discovery for lens and preprocessor services
- `MockFhirClient`: Mocks FHIR servers (ePI, IPS, PersonaVector)
- Fixture loaders: `getEpiFixture()`, `getIpsFixture()`, `getPvFixture()`, `getLensFixture()`
- ID extractors: `getEpiIdFromFixture()`, `getPatientIdFromIpsFixture()`

**HTTP Mocking**: Uses `nock` to intercept HTTP requests:
- Lens services return `{ lenses: ['lens-id-1', 'lens-id-2'] }` format
- Individual lens fetches return complete FHIR Library resources
- FHIR servers return Bundle or resource responses
- Error scenarios: 404, 500, timeouts, malformed responses

**Key Testing Patterns**:
1. Always mock ServiceClientFactory to return MockServiceClient
2. Use nock for external HTTP calls (FHIR servers, lens services, preprocessors)
3. Clean up nock after each test with `nock.cleanAll()`
4. Test both success and error paths
5. Verify response status codes and structure

#### Test Configuration

**jest.config.js**:
```javascript
{
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  setupFilesAfterEnv: ['./test/setup.ts']
}
```

#### Important Test Notes

- **Lens Format**: `/lenses` endpoint must return `{ lenses: ['id1', 'id2'] }`, not plain arrays
- **LEE Integration**: Lenses are returned as complete FHIR Library resources; LEE handles extraction
- **FHIR Resources**: Tests handle both Bundle and direct resource formats
- **Timeouts**: Some tests increase timeout for FHIR resource fetching (10000ms)
- **Flexible Assertions**: Tests accept multiple status codes `[200, 500]` for environment-dependent scenarios

## API Endpoints & Focusing Flows

All endpoints prefix: `/focusing` (not `/` - see `src/routes/routes.ts`)

### Main Focus Endpoints

Four request patterns supported (see `baseRequest()` in `src/controllers/lensesController.ts`):

1. **ePI ID + Patient Identifier**: `POST /focus/{epiId}?patientIdentifier=123`
2. **ePI ID + IPS JSON**: `POST /focus/{epiId}` with `{ips: {...}}` body
3. **ePI JSON + Patient Identifier**: `POST /focus?patientIdentifier=123` with `{epi: {...}}` body
4. **ePI JSON + IPS JSON**: `POST /focus` with `{epi: {...}, ips: {...}}` body

Query parameters:
- `lenses`: Comma-separated lens names (omit for all)
- `preprocessors`: Comma-separated preprocessor names (omit for all)

Response format controlled by `Accept` header (`application/json` or `text/html`).

### Discovery Endpoints

- `GET /preprocessing` - List available preprocessors
- `GET /lenses` - List available lenses

## Code Organization & Key Files

### Controllers (`src/controllers/`)
- `lensesController.ts`: **Main business logic** (400+ lines). Handles all focusing flows, preprocessing orchestration, lens execution, and FHIR resource manipulation
- `preprocessingController.ts`: Exposes preprocessing endpoints
- `explanationController.ts`: Generates human-readable explanations of focusing results

### Providers (`src/providers/`)
All extend `AxiosController` (`src/utils/axios.ts`) for HTTP requests:
- `preprocessing.provider.ts`: Discovers/calls preprocessor services, maps service names to URLs
- `lenses.provider.ts`: Discovers lens selectors, fetches individual lenses (base64 JavaScript)
- `fhirEpi.provider.ts`, `fhirIps.provider.ts`: Fetch resources from FHIR servers
- `profile.provider.ts`: Fetches optional Persona Vector (legacy "G-Lens profile")

### Utils (`src/utils/`)
- `ServiceClientFactory.ts`: **Critical abstraction** - returns `IServiceClient` implementation (k8s or Docker) based on `ENVIRONMENT`
- `k8sClient.ts`, `dockerClient.ts`: Implement service discovery for respective platforms
- `Logger.ts`: Custom logging utility (use `Logger.logInfo/Error/Warn/Debug()`)

### FHIR Resource Handling

**Critical helper functions** in `lensesController.ts`:
- `findResourceByType(resource, type)`: Searches FHIR Bundles or direct resources
- `getLeaflet(epi)`: Extracts leaflet sections from Composition.section
- `getCategoryCode(epi)`: Gets preprocessing status ("R"=raw, "P"=preprocessed, "E"=enhanced)
- `writeLeaflet(epi, sections)`: Updates Composition with modified sections
- `getLeafletHTMLString(sections)`: Recursively extracts all `text.div` HTML from sections
- `getLeafletSectionListFromHTMLString(html, sections)`: Parses enhanced HTML back into FHIR sections (uses JSDOM)

## Preprocessing Behavior

Only executes preprocessors if `getCategoryCode(epi)` returns `"R"` (raw), empty, or null. After preprocessing, sets category to `"P"` (preprocessed).

**Fail-safe**: If preprocessing fails or ePI remains in "R" state, returns original ePI and stops (no lenses executed). Errors returned in `GH-Focusing-Warnings` response header.

## Lens Execution

Lenses are JavaScript code strings with this structure:
```javascript
(epi, ips, pv, html) => {
  return {
    enhance: async () => { /* returns modified HTML string */ },
    explanation: async () => { /* returns explanation text */ }
  }
}
```

Execution flow (`applyLensToSections()`):
1. Extract all HTML from leaflet sections
2. Create lens function via `new Function("epi, ips, pv, html", lensCode)`
3. Execute `.enhance()` to get modified HTML
4. Parse modified HTML back into FHIR sections using JSDOM
5. If HTML changed, mark ePI as `"E"` (enhanced) and add extension to `Composition.extension`
6. Optionally call `.explanation()` for audit trail

Extensions added to ePI track which lenses were applied (see `StructureDefinition/LensesApplied`).

## Docker & Kubernetes Deployment

### Dockerfile Pattern
Multi-stage build:
1. **buildstage**: `node:16-slim` - compiles TypeScript
2. **Final**: `node:19-slim` - copies built files, runs `node index.js`

⚠️ **Note**: Different Node versions between stages (16 vs 19) - potential consistency issue.

### Kubernetes Resources (`kubernetes/base/`)
Must apply in order:
1. `001_focusing-manager-service-account.yaml` - Service account with `image-pull-secret`
2. `002_focusing-manager-role.yaml` - Role with list services permission
3. `003_focusing-manager-role-binding.yaml` - Binds role to service account
4. `004_focusing-manager-service.yaml` - Service definition
5. `005_focusing-manager-deployment.yaml` - Deployment manifest
6. `006_focusing-manager_vs.yaml` - VirtualService (Istio ingress)

Label selectors used: Services must have `eu.gravitate-health.fosps.focusing=True` or `eu.gravitate-health.fosps.preprocessing=True` labels.

## Error Handling Conventions

- Custom error class: `CustomError` in `src/error/CustomError.ts` (minimal implementation)
- HTTP errors use `HttpStatusCode` enum from `axios`
- Errors returned in response body AND `GH-Focusing-Warnings` header (JSON object with `preprocessingWarnings`, `lensesWarnings` arrays)
- Logger calls should specify file, function, message: `Logger.logError("file.ts", "functionName", "message")`

## Common Pitfalls & Edge Cases

1. **Express query param parsing**: Single-item arrays become strings. Always check `typeof` and convert back: `if (typeof lenses === "string") lenses = [lenses]`

2. **FHIR Bundle vs Resource**: Always use `findResourceByType()` - ePIs can be Bundles OR direct Composition resources

3. **Template copying**: Build script copies `src/templates/` to `build/templates/` - add new templates to build command in `package.json`

4. **Lens name mapping**: `lenses.provider.ts` maintains `lensNameMap` to handle duplicate lens names across selectors (adds numeric suffix)

5. **Category code validation**: Code only executes lenses if ePI has valid extensions AND category is not "R". Ensures preprocessed data exists before focusing.

6. **HTML xmlns requirement**: `getLeafletSectionListFromHTMLString()` searches for `div[xmlns="http://www.w3.org/1999/xhtml"]` - ensure preprocessors maintain this attribute

## Code Style Conventions

- **Async/await** preferred over promises
- **Arrow functions** for methods in providers
- **No semicolons** on most lines (inconsistent - project uses both)
- **Template literals** for string formatting
- **Destructuring** limited - mostly traditional object access
- **Error logging** before throwing/returning errors
- **Type annotations** minimal (relies on inference) - `any` used frequently

## OpenAPI Specification

Located at `openapi.yaml` - defines contract for `/focusing` endpoints. **Important**: Response types differ by `Accept` header (`application/json` returns FHIR Bundle, `text/html` returns HTML string).

## Release Process

Follow this comprehensive checklist when preparing a new release:

### Pre-Release Checks

1. **Verify correct branch**
   ```bash
   git branch --show-current
   ```
   Ensure you are on the correct release branch (typically `main` or `master`). If not, switch to the correct branch before proceeding:
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Lint the codebase**
   ```bash
   npm run lint
   ```
   Fix any linting errors before proceeding.

2. **Security audit**
   ```bash
   npm audit
   ```
   If vulnerabilities are reported, run `npm audit fix` to automatically update dependencies where possible. Review and manually fix critical/high severity issues.

3. **Update lens execution environment dependency**
   
   Check for the latest version of `@gravitate-health/lens-execution-environment`:
   ```bash
   npm outdated @gravitate-health/lens-execution-environment
   ```
   
   If a newer version is available, update it:
   ```bash
   npm install @gravitate-health/lens-execution-environment@latest
   ```
   
   Test thoroughly after this update as it affects core lens execution logic.

4. **Build the project**
   ```bash
   npm run build
   ```
   Ensure build completes without TypeScript compilation errors.

5. **Run automated tests**
   ```bash
   npm test
   ```
   
   ✅ **All 79 tests must pass** before release:
   - 36 focus integration tests (including 10 edge cases)
   - 19 preprocessing tests (including cache functionality)
   - 24 lenses tests (including error scenarios)
   
   If tests fail:
   - Review test output for specific failures
   - Fix issues in source code
   - Re-run tests until all pass
   - Consider running with coverage: `npm test -- --coverage`

6. **Manual smoke testing** (optional but recommended)
   
   Start the service and verify critical paths:
   ```bash
   npm start  # or npm run dev
   ```
   
   - Test main focusing endpoints with sample ePI/IPS data
   - Verify preprocessing discovery (`GET /focusing/preprocessing`)
   - Verify lens discovery (`GET /focusing/lenses`)
   - Test both JSON and HTML response formats (`Accept` header)
   - Validate error handling with invalid inputs

7. **Test Docker build**
   ```bash
   docker build -t ghcr.io/gravitate-health/focusing-manager:test .
   ```
   
   Optional: Run and smoke test the container:
   ```bash
   docker run -p 3000:3000 --env-file .env ghcr.io/gravitate-health/focusing-manager:test
   # Test endpoints at http://localhost:3000/focusing
   ```

### Release Execution

If all pre-release checks pass:

8. **Bump version**
   
   Use `npm version` to update version in `package.json` and create a git commit/tag automatically:
   
   - **Patch release** (bug fixes): `npm version patch` (default if not specified)
   - **Minor release** (new features, backward compatible): `npm version minor`
   - **Major release** (breaking changes): `npm version major`
   
   This command will:
   - Update version in `package.json`
   - Create a git commit with message "v{version}"
   - Create a git tag "v{version}"

9. **Push to repository**
   ```bash
   git push && git push --tags
   ```
   
   Push both commits and tags in sequence. Tags are required to trigger release workflows.

### Automated Post-Release

10. **Docker image publishing**
   
   **Automatic**: GitHub Actions workflow will detect the new tag and automatically:
   - Build the Docker image
   - Push to `ghcr.io/gravitate-health/focusing-manager:{version}`
   - Tag as `:latest` if appropriate
   
   Monitor the Actions tab in GitHub to ensure the workflow completes successfully.

### Quick Reference Commands

Complete release workflow (assuming patch release):

```bash
# Verify branch
git branch --show-current  # Ensure you're on main/master

# Pre-release checks
npm run lint
npm audit
npm outdated @gravitate-health/lens-execution-environment  # Update if needed
npm run build
npm test  # Run automated test suite (79 tests)
npm start  # Optional manual testing
docker build -t ghcr.io/gravitate-health/focusing-manager:test .

# Release (patch version)
npm version patch
git push && git push --tags

# Monitor GitHub Actions for automated Docker publishing
```

### Release Notes Best Practices

When creating release notes (manual or via GitHub Releases):
- Reference fixed issues/PRs
- Highlight breaking changes (especially for major releases)
- Document new features and lens capabilities
- Note any new environment variables or configuration requirements
- List updated dependencies (especially `@gravitate-health/lens-execution-environment` version)
- Include migration steps if required

### Rollback Procedure

If a release has critical issues:

1. **Revert in Git**
   ```bash
   git revert HEAD  # Revert the version bump commit
   git push
   ```

2. **Delete problematic tag** (if already pushed)
   ```bash
   git tag -d v{version}
   git push origin :refs/tags/v{version}
   ```

3. **Redeploy previous version** in Kubernetes
   ```bash
   kubectl set image deployment/focusing-manager \
     focusing-manager=ghcr.io/gravitate-health/focusing-manager:{previous-version} \
     -n {namespace}
   ```

## Future Maintenance Notes

- **Testing**: ✅ Jest test framework implemented with 79 tests covering focus, preprocessing, and lens functionality
- **Test Coverage**: Consider expanding coverage to include unit tests for individual utility functions
- **TypeScript strictness**: `noImplicitAny` disabled, many `any` types used
- **Persona Vector**: Code references "G-Lens profile" (legacy naming) - transitioning to "PersonaVector"
- **Lens validation**: No schema validation for lens code - relies on try/catch around `new Function()`
- **Service health checks**: No endpoint health monitoring - services may fail silently

---

When working with this codebase:
1. **Always check FHIR resource structure** with `findResourceByType()` before accessing properties
2. **Test both JSON and HTML response formats** - Liquid template rendering is separate code path
3. **Verify service discovery** works in target environment (k8s/Docker/dev)
4. **Run automated tests** before committing changes: `npm test`
5. **Log errors comprehensively** - no automated alerting exists
6. **Be cautious with lens code execution** - security implications of `new Function()`
