import type { LocationKind, LocationResponse } from '@smartmat/shared';
import type { Db } from '../../db';
import { Prisma } from '../../generated/prisma/client';

export interface LocationRepo {
  list(householdId: string): Promise<LocationResponse[]>;
  exists(householdId: string, locationId: string): Promise<boolean>;
  create(
    householdId: string,
    location: { name: string; kind: LocationKind },
  ): Promise<LocationResponse>;
  rename(householdId: string, locationId: string, name: string): Promise<LocationResponse | null>;
  /**
   * Deletes the location if it has no batches with something left in them. Used-up batches there are
   * removed (their history stays, with the batch reference cleared).
   */
  deleteIfEmpty(
    householdId: string,
    locationId: string,
  ): Promise<'deleted' | 'notFound' | 'notEmpty' | 'last'>;
}

const KIND_ORDER: Record<LocationKind, number> = { fridge: 0, freezer: 1, pantry: 2, other: 3 };

export function createLocationRepo(db: Db): LocationRepo {
  async function load(householdId: string, where: Prisma.StorageLocationWhereInput = {}) {
    const rows = await db.storageLocation.findMany({
      where: { householdId, ...where },
      select: {
        id: true,
        kind: true,
        name: true,
        createdAt: true,
        _count: { select: { batches: { where: { quantityBase: { gt: 0 } } } } },
      },
    });
    return rows
      .sort(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((r) => ({ id: r.id, kind: r.kind, name: r.name, batchCount: r._count.batches }));
  }

  return {
    list: (householdId) => load(householdId),

    async exists(householdId, locationId) {
      return (await db.storageLocation.count({ where: { id: locationId, householdId } })) === 1;
    },

    async create(householdId, location) {
      const row = await db.storageLocation.create({ data: { householdId, ...location } });
      return { id: row.id, kind: row.kind, name: row.name, batchCount: 0 };
    },

    async rename(householdId, locationId, name) {
      const { count } = await db.storageLocation.updateMany({
        where: { id: locationId, householdId },
        data: { name },
      });
      if (count === 0) return null;
      return (await load(householdId, { id: locationId }))[0] ?? null;
    },

    async deleteIfEmpty(householdId, locationId) {
      try {
        return await db.$transaction(async (tx) => {
          const location = await tx.storageLocation.findFirst({
            where: { id: locationId, householdId },
          });
          if (!location) return 'notFound' as const;
          if ((await tx.storageLocation.count({ where: { householdId } })) <= 1)
            return 'last' as const;
          const inUse = await tx.inventoryBatch.count({
            where: { locationId, householdId, quantityBase: { gt: 0 } },
          });
          if (inUse > 0) return 'notEmpty' as const;
          await tx.inventoryBatch.deleteMany({
            where: { locationId, householdId, quantityBase: 0 },
          });
          await tx.storageLocation.delete({ where: { id: locationId } });
          return 'deleted' as const;
        });
      } catch (error) {
        // A batch was added to the location at the same moment: the foreign key refuses the delete.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
          return 'notEmpty';
        throw error;
      }
    },
  };
}
