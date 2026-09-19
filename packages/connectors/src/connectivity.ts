import type { Connector, ConnectorContext, ConnectorResult } from '../../core/src/index.ts';
import { baseResult } from './types.ts';

/**
 * Used for services whose vendor publishes a human-readable page (or nothing at all).
 * The official status stays UNKNOWN — it is never guessed from connectivity.
 */
export const connectivityConnector: Connector = {
  id: 'connectivity',
  label: 'No machine-readable official status source',
  capabilities: { status: false, components: false, incidents: false, maintenance: false, regions: false },
  async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
    return baseResult(ctx.service, ctx.now(), {
      status: 'UNKNOWN',
      statusRaw: null,
      sourceUrl: ctx.service.statusPage,
      metadata: {
        provider: 'none',
        reason: ctx.service.limitation ?? 'No machine-readable official status source was found.',
        hasStatusPage: Boolean(ctx.service.statusPage),
      },
      notes: ['official status unknown — only connectivity checks are reported'],
    });
  },
};
