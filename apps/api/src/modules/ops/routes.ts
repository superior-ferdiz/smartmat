import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { backupStatusResponseSchema } from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { readBackupStatus } from './backupStatus';

export interface OpsRoutesOptions {
  requireAuth: preHandlerAsyncHookHandler;
  backupStatusFile: string | null;
  now: Clock;
}

/** Spec 13 (NFR-OPS-003). Logged in only: whether backups work is nothing for the outside world. */
export const opsRoutes: FastifyPluginAsyncZod<OpsRoutesOptions> = async (app, options) => {
  app.get(
    '/ops/backup',
    { preHandler: options.requireAuth, schema: { response: { 200: backupStatusResponseSchema } } },
    async () => readBackupStatus(options.backupStatusFile, options.now()),
  );
};
