import axios, { AxiosInstance } from 'axios';
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
    const response = await docker.get<DockerContainer[]>('/containers/json', {
      params: {
        filters: JSON.stringify({
          label: [label],
        }),
      },
    });

    return response.data.map((container) => {
      const name = container.Names[0].replace(/^\//, '');
      const networks = container.NetworkSettings?.Networks;
      const ip =
        networks && Object.values(networks).length > 0
          ? Object.values(networks)[0].IPAddress
          : null;

      // Pick first private port (internal to container)
      const port = container.Ports?.[0]?.PrivatePort;

      if (!port) return null;

      // Prefer Docker DNS name (e.g., 'db') over IP
      const host = name || ip;

      return `http://${host}:${port}`;
    }).filter((url): url is string => url !== null);
  } catch (err) {
    console.error('Error querying Docker API:', err);
    return [];
  }
}
}