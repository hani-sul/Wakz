import type { Connector, ConnectorId } from '../../core/src/index.ts';
import { statuspageConnector } from './statuspage.ts';
import { statusIoConnector } from './statusio.ts';
import { instatusConnector } from './instatus.ts';
import { betterStackConnector } from './betterstack.ts';
import { rssFeedConnector } from './rss-feed.ts';
import { googleCloudConnector } from './google-cloud.ts';
import { awsHealthConnector } from './aws-health.ts';
import { xboxStatusConnector } from './xbox-status.ts';
import { nuvioStatusConnector } from './nuvio-status.ts';
import { uptimeJsonConnector } from './uptime-json.ts';
import { steamApiConnector } from './steam-api.ts';
import { connectivityConnector } from './connectivity.ts';

export const CONNECTORS: Record<ConnectorId, Connector> = {
  statuspage: statuspageConnector,
  statusio: statusIoConnector,
  instatus: instatusConnector,
  betterstack: betterStackConnector,
  'rss-feed': rssFeedConnector,
  'google-cloud': googleCloudConnector,
  'aws-health': awsHealthConnector,
  'xbox-status': xboxStatusConnector,
  'nuvio-status': nuvioStatusConnector,
  'uptime-json': uptimeJsonConnector,
  'steam-api': steamApiConnector,
  connectivity: connectivityConnector,
};

export function getConnector(id: ConnectorId): Connector {
  const connector = CONNECTORS[id];
  if (!connector) throw new Error(`Unknown connector: ${id}`);
  return connector;
}

export * from './types.ts';
export { statuspageConnector } from './statuspage.ts';
export { statusIoConnector } from './statusio.ts';
export { instatusConnector } from './instatus.ts';
export { betterStackConnector } from './betterstack.ts';
export { rssFeedConnector } from './rss-feed.ts';
export { googleCloudConnector } from './google-cloud.ts';
export { awsHealthConnector } from './aws-health.ts';
export { xboxStatusConnector } from './xbox-status.ts';
export { nuvioStatusConnector } from './nuvio-status.ts';
export { uptimeJsonConnector } from './uptime-json.ts';
export { steamApiConnector } from './steam-api.ts';
export { connectivityConnector } from './connectivity.ts';
