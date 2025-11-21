import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import { IServiceClient } from './IServiceClient';

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  Labels: Record<string, string>;
  NetworkSettings?: {
    Networks: {
      [networkName: string]: {
        IPAddress: string;
      };
    };
  };
  Ports: Array<{
    PrivatePort: number;
    PublicPort?: number;
    Type: string;
  }>;
}

const docker: AxiosInstance = axios.create({
  baseURL: 'http://localhost',
  socketPath: '/var/run/docker.sock',
});

export class DockerClient implements IServiceClient {

  async getServiceBaseUrlsByLabel(label: string): Promise<string[]> {
    try {
      console.debug('[DockerClient] Checking socket exists:', fs.existsSync('/var/run/docker.sock'));
      const filters = { label: [label] };
      console.debug('[DockerClient] Requesting containers with filters:', JSON.stringify(filters));

      const response = await docker.get<DockerContainer[]>('/containers/json', {
        params: {
          filters: JSON.stringify(filters),
        },
      });

      console.debug('[DockerClient] Docker API response status:', response.status);
      if (Array.isArray(response.data)) {
        console.debug('[DockerClient] Number of containers returned:', response.data.length);
        // Log brief info about the first few containers for debugging
        response.data.slice(0, 5).forEach((c, i) =>
          console.debug(`[DockerClient] container[${i}] id=${c.Id} names=${JSON.stringify(c.Names)} image=${c.Image} ports=${JSON.stringify(c.Ports)} networks=${JSON.stringify(Object.keys(c.NetworkSettings?.Networks || {}))}`)
        );
      } else {
        console.debug('[DockerClient] Docker API did not return an array. Response data:', response.data);
      }

      return response.data.map((container) => {
        const name = container.Names?.[0]?.replace(/^\//, '') ?? '';
        const networks = container.NetworkSettings?.Networks;
        const ip =
          networks && Object.values(networks).length > 0
            ? Object.values(networks)[0].IPAddress
            : null;

        // Pick first private port (internal to container)
        const port = container.Ports?.[0]?.PrivatePort;

        if (!port) {
          console.debug(`[DockerClient] Skipping container ${container.Id} (no port found)`);
          return null;
        }

        // Prefer Docker DNS name (e.g., 'db') over IP
        const host = name || ip;
        if (!host) {
          console.debug(`[DockerClient] Skipping container ${container.Id} (no host found). name="${name}" ip="${ip}"`);
          return null;
        }

        const url = `http://${host}:${port}`;
        console.debug(`[DockerClient] Resolved container ${container.Id} -> ${url}`);
        return url;
      }).filter((url): url is string => url !== null);
    } catch (err: any) {
      console.error('[DockerClient] Error querying Docker API:', {
        message: err?.message,
        code: err?.code,
        responseStatus: err?.response?.status,
        responseData: err?.response?.data,
        stack: err?.stack,
      });
      return [];
    }
  }
}