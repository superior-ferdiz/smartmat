import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CATEGORY_KEYS } from '@smartmat/shared';
import type { Db } from '../../db';

/** The category list from the database (seeded by the migration). Public: it contains no user data. */
export const categoryRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  app.get(
    '/categories',
    { schema: { response: { 200: z.array(z.object({ key: z.enum(CATEGORY_KEYS) })) } } },
    async () => {
      const rows = await db.category.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { key: true },
      });
      return rows.map((r) => ({ key: z.enum(CATEGORY_KEYS).parse(r.key) }));
    },
  );
};
