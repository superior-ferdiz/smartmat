import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db';

/** Used by Playwright and `npm run dev` to know when the API is ready. */
export const healthRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  app.get(
    '/health',
    { schema: { response: { 200: z.object({ status: z.literal('ok') }) } } },
    async () => {
      await db.$queryRaw`SELECT 1`;
      return { status: 'ok' as const };
    },
  );
};
