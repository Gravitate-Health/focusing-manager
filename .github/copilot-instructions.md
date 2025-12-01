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

⚠️ **No automated tests exist** (`"test": "echo \"Error: no test specified\" && exit 1"` in `package.json`). Manual testing via API calls is current practice.

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

## Future Maintenance Notes

- **Testing**: No test framework exists - consider adding Jest/Mocha
- **TypeScript strictness**: `noImplicitAny` disabled, many `any` types used
- **Persona Vector**: Code references "G-Lens profile" (legacy naming) - transitioning to "PersonaVector"
- **Lens validation**: No schema validation for lens code - relies on try/catch around `new Function()`
- **Service health checks**: No endpoint health monitoring - services may fail silently

---

When working with this codebase:
1. **Always check FHIR resource structure** with `findResourceByType()` before accessing properties
2. **Test both JSON and HTML response formats** - Liquid template rendering is separate code path
3. **Verify service discovery** works in target environment (k8s/Docker/dev)
4. **Log errors comprehensively** - no automated alerting exists
5. **Be cautious with lens code execution** - security implications of `new Function()`
