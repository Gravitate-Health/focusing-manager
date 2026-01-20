import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import { IServiceClient } from './IServiceClient.js';

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
      console.debug('[DockerClient] socket exists:', fs.existsSync('/var/run/docker.sock'));
      const filters = { label: [label] };

      // Try server-side filter first
      let response = await docker.get<DockerContainer[]>('/containers/json', {
        params: {
          filters: JSON.stringify(filters),
        },
      });

      if (!Array.isArray(response.data)) {
        response.data = [];
      }
      const serverCount = Array.isArray(response.data) ? response.data.length : 0;
      console.debug('[DockerClient] server-side containers:', serverCount);

      let containers = response.data;

      // If server-side filter returned nothing, fall back to fetching all and filter client-side.
      if (!containers || containers.length === 0) {
        console.debug('[DockerClient] falling back to client-side filter (fetching all containers)');
        const allResp = await docker.get<DockerContainer[]>('/containers/json', { params: { all: true } });
        containers = Array.isArray(allResp.data) ? allResp.data : [];

        // parse label into key/value or key-only (case-insensitive comparison)
        const idx = label.indexOf('=');
        let key: string, value: string | undefined;
        if (idx >= 0) {
          key = label.slice(0, idx);
          value = label.slice(idx + 1);
        } else {
          key = label;
          value = undefined;
        }

        const keyLower = key.toLowerCase();
        const valueLower = value !== undefined ? value.toLowerCase() : undefined;

        containers = containers.filter((c) => {
          const labels = c.Labels || {};
          // check keys case-insensitively
          const matchingKey = Object.keys(labels).find((k) => k.toLowerCase() === keyLower);
          if (!matchingKey) return false;
          if (valueLower !== undefined) {
            const labVal = (labels[matchingKey] ?? '').toLowerCase();
            return labVal === valueLower;
          }
          return true;
        });

        console.debug('[DockerClient] containers after client-side filtering:', containers.length);
      }

      return containers.map((container) => {
        const name = container.Names?.[0]?.replace(/^\//, '') ?? '';
        const networks = container.NetworkSettings?.Networks;
        const ip =
          networks && Object.values(networks).length > 0
            ? Object.values(networks)[0].IPAddress
            : null;

        const port = container.Ports?.[0]?.PrivatePort;
        if (!port) return null;

        const host = name || ip;
        if (!host) return null;

        return `http://${host}:${port}`;
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