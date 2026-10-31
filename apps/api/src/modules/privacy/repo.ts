import type { Db } from '../../db';

/*
 * Spec 13 (FR-PRIV-001): everything the export contains, read straight from the tables as JSON. Each table names
 * the columns that are left out; `privacy.api.test.ts` lists the columns that are exported, so a new column has to
 * be decided on (exported or left out) before that test passes again.
 */

type Row = Record<string, unknown>;

/** Household tables: every row with the household id. Table and column names are constants, never input. */
export const HOUSEHOLD_TABLES = [
  { table: 'storage_locations', omit: [] },
  { table: 'inventory_items', omit: [] },
  { table: 'inventory_batches', omit: [] },
  { table: 'inventory_events', omit: [] },
  { table: 'purchases', omit: [] },
  { table: 'purchase_lines', omit: [] },
  { table: 'food_budgets', omit: [] },
  { table: 'shopping_lists', omit: [] },
  { table: 'shopping_list_items', omit: [] },
  { table: 'shopping_list_item_recipes', omit: [] },
  { table: 'shopping_list_item_meals', omit: [] },
  { table: 'meal_plan_entries', omit: [] },
  { table: 'household_barcodes', omit: [] },
  // Spec 16 (FR-REC-010): the household's own recipes and their lines (global recipes have no household_id).
  { table: 'recipes', omit: [] },
  { table: 'recipe_ingredients', omit: [] },
  // Images and OCR text are not exported: they are deleted within 7 days anyway (spec 08), and the image is binary.
  { table: 'receipts', omit: [] },
] as const;

export interface HouseholdExport {
  household: Row;
  membership: Row;
  /** Current members as the app shows them: name and role, no e-mail, nothing about their allergies. */
  members: Row[];
  /** Only for the owner, who sees them in the app. Without the token hash. */
  invitations: Row[];
  /** The caller's own seen/dismissed marks in this household. */
  notificationStates: Row[];
  tables: Record<string, Row[]>;
}

export interface AccountExport {
  account: Row;
  allergens: string[];
  /** Spec 16 (FR-ALG-001): the ingredients the user does not tolerate, by name. */
  avoidedIngredients: { id: string; name: string }[];
  notificationSettings: Row | null;
  sessions: Row[];
  households: HouseholdExport[];
}

export interface PrivacyRepo {
  exportFor(userId: string): Promise<AccountExport | null>;
}

function minus(omit: readonly string[]) {
  return omit.map((column) => ` - '${column}'`).join('');
}

export function createPrivacyRepo(db: Db): PrivacyRepo {
  return {
    async exportFor(userId) {
      // One snapshot: everything is read in the same repeatable-read transaction.
      return db.$transaction(
        async (tx) => {
          const read = async (sql: string, ...params: unknown[]) =>
            (await tx.$queryRawUnsafe<{ row: Row }[]>(sql, ...params)).map((r) => r.row);
          const [account] = await read(
            // Secrets are never exported: the password hash and the (encrypted) two-factor secrets.
            `SELECT to_jsonb(u)${minus(['password_hash', 'totp_secret', 'totp_pending_secret', 'totp_last_step'])} AS row
               FROM users u WHERE id = $1::uuid`,
            userId,
          );
          if (!account) return null;
          const allergens = (
            await tx.userAllergen.findMany({ where: { userId }, select: { allergen: true } })
          ).map((a) => a.allergen);
          const avoidedIngredients = (
            await tx.userAvoidedIngredient.findMany({
              where: { userId },
              orderBy: { ingredient: { name: 'asc' } },
              select: { ingredient: { select: { id: true, name: true } } },
            })
          ).map((a) => a.ingredient);
          const [settings] = await read(
            `SELECT to_jsonb(s)${minus(['user_id'])} AS row FROM notification_settings s WHERE user_id = $1::uuid`,
            userId,
          );
          const sessions = await read(
            `SELECT to_jsonb(s)${minus(['token_hash', 'csrf_token', 'user_id'])} AS row
               FROM sessions s WHERE user_id = $1::uuid ORDER BY created_at`,
            userId,
          );
          const memberships = await read(
            `SELECT to_jsonb(m) AS row FROM household_members m WHERE user_id = $1::uuid ORDER BY created_at`,
            userId,
          );

          const households: HouseholdExport[] = [];
          for (const membership of memberships) {
            const householdId = String(membership.household_id);
            const [household] = await read(
              `SELECT to_jsonb(h) AS row FROM households h WHERE id = $1::uuid`,
              householdId,
            );
            const members = await read(
              `SELECT jsonb_build_object('user_id', u.id, 'display_name', u.display_name, 'role', m.role,
                      'member_since', m.created_at) AS row
                 FROM household_members m JOIN users u ON u.id = m.user_id
                WHERE m.household_id = $1::uuid ORDER BY m.created_at`,
              householdId,
            );
            const invitations =
              membership.role === 'owner'
                ? await read(
                    `SELECT to_jsonb(i)${minus(['token_hash'])} AS row
                       FROM household_invitations i WHERE household_id = $1::uuid ORDER BY created_at`,
                    householdId,
                  )
                : [];
            const notificationStates = await read(
              `SELECT to_jsonb(n)${minus(['user_id', 'household_id'])} AS row
                 FROM notification_states n WHERE household_id = $1::uuid AND user_id = $2::uuid`,
              householdId,
              userId,
            );
            const tables: Record<string, Row[]> = {};
            for (const { table, omit } of HOUSEHOLD_TABLES) {
              tables[table] = await read(
                `SELECT to_jsonb(t)${minus(omit)} AS row FROM ${table} t WHERE household_id = $1::uuid`,
                householdId,
              );
            }
            households.push({
              household: household ?? {},
              membership,
              members,
              invitations,
              notificationStates,
              tables,
            });
          }
          return {
            account,
            allergens,
            avoidedIngredients,
            notificationSettings: settings ?? null,
            sessions,
            households,
          };
        },
        { isolationLevel: 'RepeatableRead' },
      );
    },
  };
}
