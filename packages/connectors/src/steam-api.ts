import { fetchResource } from '../../core/src/index.ts';
import type { Connector, ConnectorContext, ConnectorResult } from '../../core/src/index.ts';
import { baseResult, failureResult } from './types.ts';

type SteamServerInfo = { servertime?: number; servertimestring?: string };

export const steamApiConnector: Connector = {
  id: 'steam-api',
  label: 'Steam Web API (ISteamWebAPIUtil)',
  capabilities: { status: true, components: false, incidents: false, maintenance: false, regions: false },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    const probeUrl = String(ctx.service.connectorConfig.probeUrl ?? 'https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/');
    const response = await fetchResource<SteamServerInfo>(probeUrl, { timeoutMs: ctx.timeoutMs });
    if (!response.ok || !response.data?.servertime) {
      return failureResult(ctx.service, ctx.now(), response.error ?? 'Steam Web API did not return server time', probeUrl);
    }

    const seconds = response.data.servertime;
    return baseResult(ctx.service, ctx.now(), {
      status: 'OPERATIONAL',
      statusRaw: `Steam Web API responding (server time ${response.data.servertimestring ?? seconds})`,
      sourceUrl: probeUrl,
      components: [{
        externalId: 'steam-web-api',
        name: 'Steam Web API',
        group: 'Official API',
        status: 'OPERATIONAL',
        statusRaw: 'responding',
        position: 0,
      }],
      metadata: {
        provider: 'steam-web-api',
        serverTime: seconds,
        note: 'Valve publishes no official incident feed; this only proves the API is answering.',
      },
      notes: ['provider=steam-web-api', 'no official status/incident feed exists'],
    });
  },
};
