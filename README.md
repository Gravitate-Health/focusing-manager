# Focusing Manager

[![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache)

## Table of contents

- [Focusing Manager](#focusing-manager)
  - [Table of contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Deployment](#deployment)
  - [Development](#development)
  - [Focusing Flows](#focusing-flows)
  - [Getting help](#getting-help)
  - [Contributing](#contributing)
  - [License](#license)
  - [Authors and history](#authors-and-history)


## Requirements

To let this service query a Kubernetes cluster, the cluster needs a `role`, `serviceaccount` and `rolebinding` to grant permission to query the cluster. These resources are created with the following files:
- [Service account YAML file](./kubernetes/base/001_focusing-manager-service-account.yaml): Creates the service account which will be used by the pods. This service account uses the `image-pull-secret`.
- [Role YAML file](./kubernetes/base/002_focusing-manager-role.yaml): Creates role with permission to list services.
- [Role Binding YAML file](./kubernetes/base/003_focusing-manager-role-binding.yaml): Binds the role to the service account

To apply them: 

```bash
kubectl apply -f kubernetes/base/001_focusing-manager-service-account.yaml
kubectl apply -f kubernetes/base/002_focusing-manager-role.yaml
kubectl apply -f kubernetes/base/003_focusing-manager-role-binding.yaml
```

## Deployment

The service needs the following environment variables:

**1. FHIR ENDPOINTS**

These URLs *may* point to the same FHIR server.

- `FHIR_EPI_URL`: URL to the FHIR ePI server endpoint, required for ePI id [focusing flows](#focusing-flows).
- `FHIR_IPS_URL`: URL to the FHIR IPS server endpoint, required for IPS id [focusing flows](#focusing-flows).
- `PERSONA_VECTOR_URL`: *Optional* URL to the FHIR server where Persona Vector data is stored.

**2. Service Discovery**

- `ENVIRONMENT`: Deployment environment (`production` for kubernetes or `standalone` for Docker)
- `FOCUSING_LABEL_SELECTOR`: The focusing label selector. Kubernetes cluster (or Docker) will filter the services with this label selector. (defaults to `eu.gravitate-health.fosps.focusing=True`)
- `PREPROCESSING_LABEL_SELECTOR`: The preprocessing label selector. Kubernetes cluster (or Docker) will filter the services with this label selector. (defaults to `eu.gravitate-health.fosps.preprocessing=True`)
- `PREPROCESSING_EXTERNAL_ENDPOINTS`: *Optional* comma-separated list of *external* preprocessing service base URLs
    - Example: `http://preprocessor1.example.com:8080,http://preprocessor2.example.com:9090`
    - Note: Do not include the `/preprocess` path
- `PREPROCESSING_TIMEOUT`: *Optional* timeout in milliseconds for preprocessing service calls (defaults to `20000` - 20 seconds)
    - Example: `30000` for 30 seconds
    - Preprocessing services can take significant time to process ePIs with semantic annotations

**3. Lens Execution Configuration**

- `LENS_EXECUTION_TIMEOUT`: *Optional* timeout in milliseconds for individual lens execution (defaults to `1000` - 1 second)
    - Example: `2000` for 2 seconds
    - Controls maximum allowed execution time per lens to prevent long-running or hanging lenses
    - If a lens exceeds this timeout, it will be terminated and an error will be reported

- `LEE_LOG_LEVEL`: *Optional* minimum log level for Lens Execution Environment (and executed lenses) logs (defaults to `INFO`)
    - Allowed values: `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`
    - Example: `DEBUG` for verbose logging, `ERROR` for errors only
    - Filters logs from both LEE core and lens execution based on severity

- `LEE_LOGGING_ENABLED`: *Optional* enable/disable LEE core logging (defaults to `true`)
    - Set to `false` to completely disable logging from the Lens Execution Environment core
    - Example: `false` to silence LEE logs, better privacy and performance for **production environments**.

**4. Preprocessing Cache Configuration**

The service supports caching of preprocessed ePIs to improve performance and reduce load on preprocessing services. Caching uses a prefix-based strategy where each step in the preprocessing pipeline is cached independently.

- `PREPROCESSING_CACHE_BACKEND`: Cache implementation to use (defaults to `memory`)
    - `none` or `disabled`: No caching
    - `memory`: In-memory LRU cache (good for single-replica or development)
    - `redis`: Redis-based cache (recommended for production with multiple replicas)
    - `composite`: Two-level cache with memory (L1) + Redis (L2) - best performance in production
- `PREPROCESSING_CACHE_TTL_MS`: Time-to-live for cache entries in milliseconds (defaults to `1200000` - 20 minutes)
- `PREPROCESSING_CACHE_MAX_ITEMS`: Maximum number of items in memory cache (defaults to `1000`)
- `PREPROCESSING_CACHE_REDIS_URL`: Redis connection URL (defaults to `redis://localhost:6379`)
    - Required when using `redis` or `composite` backends
    - Example: `redis://redis-service:6379` or `redis://:password@redis-host:6379/0`
- `PREPROCESSING_CACHE_COMPRESS`: Enable gzip compression for cached values (defaults to `false`)
    - Recommended for large ePIs when using Redis to reduce storage and network usage
- `PREPROCESSING_CACHE_SCHEMA_VERSION`: Cache schema version for invalidation on format changes (defaults to `1`)

Cache behavior:
- Sequential preprocessing pipeline is cached at each step
- On cache miss for full pipeline, longest matching prefix is used to skip already-processed steps
- Each successful preprocessing step writes to cache for future reuse
- Cache keys include ePI content hash + ordered list of preprocessing steps

**5. Kubernetes Dev**
*Optional* In production, the service uses the service account to query the cluster. Outside the cluster this is not possible. To develop this service outside the cluster, set the the following enviornment variables (or create a `.env` file) so the kubernetes client can connect to the cluster:

- `ENVIRONMENT`: "dev"
- `CLUSTER_NAME`: Cluster name
- `CLUSTER_SERVER`: Cluster URL
- `CLUSTER_CADATA`: CA data of the cluster
- `USER_NAME`: User
- `USER_TOKEN`: User token
- `CONTEXT_NAME`: Context name

To deploy the service, create the `service`, `deployment` and `virtual service`:

```bash
kubectl apply -f kubernetes-yaml/004_focusing-manager-service.yaml
kubectl apply -f kubernetes-yaml/005_focusing-manager-deployment.yaml
kubectl apply -f kubernetes-yaml/006_focusing-manager_vs.yml
```

And try querying the focusing manager:

```bash
curl --location 'https://fosps.gravitatehealth.eu/focusing'
```

## Development

The service can be executed listening for changes under the `src` directory with:

```bash
npm run dev
```

This service uses the [Kubernetes javascript client](https://github.com/kubernetes-client/javascript) to query the kubernetes cluster

## Focusing Flows

This service has 4 ways of focusing ePIs, depending on which parameters you use:

- ePI ID + Patient Identifier: Fetch both from servers
- ePI ID + IPS JSON: Provide IPS in request body
- ePI JSON + Patient Identifier: Provide ePI, fetch IPS
- ePI JSON + IPS JSON: Provide both in request body

### FHIR Format Support

The service accepts FHIR resources in multiple formats via the `Content-Type` header:

**Supported Request Content Types:**
- `application/fhir+json` or `application/json` - FHIR JSON format (default, i.e. if not set)
- `application/fhir+xml` or `application/xml` - FHIR XML format
- `application/fhir+turtle` or `text/turtle` - FHIR RDF Turtle format 
- `text/n3` - FHIR N3 RDF format 

**Example XML Request:**
```bash
curl -X POST 'https://fosps.gravitatehealth.eu/focusing/focus' \
  -H 'Content-Type: application/fhir+xml' \
  -H 'Accept: application/json' \
  --data '<?xml version="1.0" encoding="UTF-8"?>
<Bundle xmlns="http://hl7.org/fhir">
  <resourceType value="Bundle"/>
  <type value="document"/>
  ...
</Bundle>'
```

**Response Format:** Determined by the `Accept` header:
- `application/json` - Returns FHIR JSON (default)
- `text/html` - Returns HTML rendering of the focused ePI

**RDF Support:** The service now includes full RDF support via the N3.js library:
- Parse RDF Turtle and N3 formats in request bodies
- Convert RDF triples to FHIR JSON for internal processing
- Serialize FHIR JSON back to RDF formats (if needed)
- Automatic handling of FHIR namespaces and data types

### Parameters

Optionally, you can also provide a PersonaVector in the following ways:

- PersonaVector ID query parameter: Fetch from server
- PersonaVector JSON in request body (pv field): Provide directly

Optional query parameters:

- `patientIdentifier`: Patient identifier to fetch IPS
- `personaVectorId`: PersonaVector identifier to fetch PersonaVector
- `lenses`: Comma-separated list of lens names (omit to use all), available lenses can be found by `GET /focusing/lenses`
- `preprocessors`: Comma-separated list of preprocessor names (omit to use all), available preprocessor can be found by `GET /focusing/preprocessing`

Monitoring endpoints:

- `GET /focusing/preprocessing` - List available preprocessing services
- `GET /focusing/preprocessing/cache/stats` - Get cache statistics (hits, misses, sets, errors)
- `GET /focusing/lenses` - List available lenses

Example:
```
curl 'https://fosps.gravitatehealth.eu/focusing/focus/epi123?patientIdentifier=patient456&personaVectorId=pv789&lenses=lens1,lens2'
```
Getting help
------------
In case you find a problem or you need extra help, please use the issues tab to report the issue.

Contributing
------------
To contribute, fork this repository and send a pull request with the changes squashed.

License
------------

This project is distributed under the terms of the [Apache License, Version 2.0 (AL2)](https://www.apache.org/licenses/LICENSE-2.0). The license applies to this file and other files in the [GitHub repository](https://github.com/Gravitate-Health/keycloak) hosting this file.

```
Copyright 2022 Universidad Politécnica de Madrid

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

Authors and history
---------------------------
- Guillermo Mejías ([@gmej](https://github.com/gmej))
- Alejandro Alonso ([@aalonsolopez](https://github.com/aalonsolopez))
- Alejandro Medrano ([@amedranogil](https://github.com/amedranogil))
