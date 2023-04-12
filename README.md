# Focusing Manager

[![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache)

## Table of contents

- [Focusing Manager](#focusing-manager)
  - [Table of contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Deployment](#deployment)
  - [Development](#development)
  - [Getting help](#getting-help)
  - [Contributing](#contributing)
  - [License](#license)
  - [Authors and history](#authors-and-history)


## Requirements

To let this service to query a kubernetes cluster, the cluster needs a `role`, `serviceaccount` and `rolebinding` to grant permission to query the cluster. This resources are created with the following files:
- [Service account YAML file](./kubernetes-yaml/001_focusing-manager-service-account.yaml): Creates the service account which will be use by the pods. This service account uses the `image-pull-secret`.
- [Role YAML file](./kubernetes-yaml/002_focusing-manager-role.yaml): Creates role with permission to list services.
- [Role Binding YAML file](./kubernetes-yaml/003_focusing-manager-role-binding.yaml): Binds the role to the service account

To apply them: 
```bash
kubectl apply -f kubernetes-yaml/001_focusing-manager-service-account.yml
kubectl apply -f kubernetes-yaml/002_focusing-manager-role.yml
kubectl apply -f kubernetes-yaml/003_focusing-manager-role-binding.yml
```

## Deployment

To deploy the service, create the `service`, `deployment` and `virtual service`:
```bash
kubectl apply -f kubernetes-yaml/004_focusing-manager-service.yml
kubectl apply -f kubernetes-yaml/005_focusing-manager-deployment.yml
kubectl apply -f kubernetes-yaml/006_profile_vs.yml
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

In production, the service uses the service account to query the cluster. Outside the cluster this is not possible. To develop this service outside the cluster, set the the following enviornment variables (or create a `.env` file) so the kubernetes client can connect to the cluster:
- `ENVIRONMENT`: "dev"
- `CLUSTER_NAME`: Cluster name
- `CLUSTER_SERVER`: Cluster URL
- `CLUSTER_CADATA`: CA data of the cluster
- `USER_NAME`: User
- `USER_TOKEN`: User token
- `CONTEXT_NAME`: Context name

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