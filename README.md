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
- `PROFILE_URL`: *Optional* URL to the FHIR server where profile (Persona Vector) is stored.

**2. Service Discovery**

- `ENVIRONMENT`: Deployment environment (`production` for kubernetes or `standalone` for Docker)
- `FOCUSING_LABEL_SELECTOR`: The focusing label selector. Kubernetes cluster (or Docker) will filter the services with this label selector. (defaults to `eu.gravitate-health.fosps.focusing=True`)
- `PREPROCESSING_LABEL_SELECTOR`: The preprocessing label selector. Kubernetes cluster (or Docker) will filter the services with this label selector. (defaults to `eu.gravitate-health.fosps.preprocessing=True`)
- `PREPROCESSING_EXTERNAL_ENDPOINTS`: *Optional* comma-separated list of *external* preprocessing service base URLs
    - Example: `http://preprocessor1.example.com:8080,http://preprocessor2.example.com:9090`
    - Note: Do not include the `/preprocess` path

**3. Kubernetes Dev**
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

- PI ID + Patient Identifier: Fetch both from servers
- ePI ID + IPS JSON: Provide IPS in request body
- ePI JSON + Patient Identifier: Provide ePI, fetch IPS
- ePI JSON + IPS JSON: Provide both in request body

Optional query parameters:

- `lenses`: Comma-separated list of lens names (omit to use all), available lenses can be found by `GET /focusing/lenses`
- `preprocessors`: Comma-separated list of preprocessor names (omit to use all), available preprocessor can be found by `GET /focusing/preprocessing`

Example:
```
curl 'https://fosps.gravitatehealth.eu/focusing/focus/epi123?patientIdentifier=patient456&lenses=lens1,lens2'
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
