import { CATEGORIES, SERVICES, collectableServices, createLogger } from '../../../packages/core/src/index.ts';
import { loadConfig } from '../../../packages/core/src/config.ts';
import { countRows, openDatabase, pruneOldData, seedCatalog } from '../../../packages/db/src/index.ts';
import { collectAll, collectService } from './runner.ts';

const args = new Set(process.argv.slice(2));
const once = args.has('--once');
const seedOnly = args.has('--seed-only');
const serviceFlag = [...args].find((arg) => arg.startsWith('--service='));

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.logLevel, 'collector');
  const db = openDatabase(config.dbPath);

  seedCatalog(db, CATEGORIES, SERVICES, config.defaultPollSeconds);
  const counts = countRows(db);
  log.info('catalog seeded', { services: counts.services, categories: counts.categories, db: config.dbPath });

  if (seedOnly) {
    log.info('seed-only run finished');
    return;
  }

  if (once) {
    const only = serviceFlag ? [serviceFlag.split('=')[1] as string] : undefined;
    const started = Date.now();
    const summaries = await collectAll(db, config, only);
    const failed = summaries.filter((summary) => !summary.connectorOk);
    log.info('single pass finished', { services: summaries.length, failures: failed.length, durationMs: Date.now() - started });
    for (const summary of summaries) {
      log.info(`${summary.slug}: official=${summary.officialStatus} connectivity=${summary.connectivityStatus}`, {
        latency: summary.latency,
        errors: summary.errors,
      });
    }
    pruneOldData(db, { checks: 14, history: 90, runs: 7 });
    return;
  }

  log.info('collector loop starting', {
    concurrency: config.collectorConcurrency,
    defaultPollSeconds: config.defaultPollSeconds,
    connectivityPollSeconds: config.connectivityPollSeconds,
    region: config.region,
  });

  const lastRun = new Map<string, number>();
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      const due = collectableServices().filter((service) => {
        const last = lastRun.get(service.slug);
        if (last === undefined) return true;
        const interval = Math.min(service.pollSeconds ?? config.defaultPollSeconds, config.connectivityPollSeconds);
        return now - last >= interval * 1000;
      });
      const queue = [...due];
      const workers = Array.from({ length: Math.max(1, Math.min(config.collectorConcurrency, queue.length)) }, async () => {
        while (queue.length > 0) {
          const service = queue.shift();
          if (!service) break;
          const summary = await collectService(db, service, config);
          lastRun.set(service.slug, Date.now());
          if (!summary.connectorOk) {
            log.warn(`${service.slug} finished with errors`, { errors: summary.errors });
          }
        }
      });
      await Promise.all(workers);
      if (due.length > 0) {
        pruneOldData(db, { checks: 14, history: 90, runs: 7 });
      }
    } catch (error) {
      log.error('collector tick failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      running = false;
    }
  };

  await tick();
  setInterval(() => {
    void tick();
  }, 5_000);
}

await main();
