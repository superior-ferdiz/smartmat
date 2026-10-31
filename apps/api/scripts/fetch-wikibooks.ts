import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { osloDate } from '@smartmat/shared';

/*
 * FR-REC-005 (spec 09, ADR-0016): fetches the Wikibooks Cookbook pages listed in
 * prisma/seed/sources/wikibooks.json and saves each page's wikitext with its revision id, so every translated
 * recipe in prisma/seed/recipes/ can be checked against the exact original it came from.
 *
 * Run by a developer only: npm run recipes:fetch -w @smartmat/api [-- slug ...]
 * The app itself never contacts Wikibooks.
 */

const API = 'https://en.wikibooks.org/w/api.php';
const EXPECTED_LICENSE = 'https://creativecommons.org/licenses/by-sa/4.0/';
/** Wikimedia asks scripts for a User-Agent with a way to reach the operator (decision 5 in spec 09). */
const CONTACT = process.env.WIKIMEDIA_CONTACT ?? 'https://github.com/superior-ferdiz';
const USER_AGENT = `SmartMat-recipe-import/0.1 (APP2000 student project; ${CONTACT})`;
const TIMEOUT_MS = 15_000;
const PAUSE_MS = 1_000;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcesDir = join(root, 'prisma/seed/sources');

const listSchema = z.array(
  z.object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    title: z.string().startsWith('Cookbook:'),
  }),
);

const pageSchema = z.object({
  query: z.object({
    pages: z
      .array(
        z.object({
          pageid: z.number().int(),
          ns: z.number().int(),
          title: z.string(),
          missing: z.boolean().optional(),
          revisions: z
            .array(
              z.object({
                revid: z.number().int(),
                timestamp: z.string(),
                slots: z.object({ main: z.object({ content: z.string() }) }),
              }),
            )
            .length(1)
            .optional(),
        }),
      )
      .length(1),
  }),
});

const rightsSchema = z.object({
  query: z.object({ rightsinfo: z.object({ url: z.string(), text: z.string() }) }),
});

async function api(params: Record<string, string>): Promise<unknown> {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2' })}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Wikibooks answered ${response.status}`);
  return response.json();
}

const pause = () => new Promise((done) => setTimeout(done, PAUSE_MS));

async function main() {
  const list = listSchema.parse(
    JSON.parse(readFileSync(join(sourcesDir, 'wikibooks.json'), 'utf8')),
  );
  const only = new Set(process.argv.slice(2));
  const wanted = only.size > 0 ? list.filter((p) => only.has(p.slug)) : list;

  const rights = rightsSchema.parse(
    await api({ action: 'query', meta: 'siteinfo', siprop: 'rightsinfo' }),
  );
  const licenseUrl = rights.query.rightsinfo.url.replace(/deed\.[a-z-]+$/, '');
  if (licenseUrl !== EXPECTED_LICENSE)
    throw new Error(
      `Wikibooks licence is now ${rights.query.rightsinfo.text}; check ADR-0016 first`,
    );

  mkdirSync(join(sourcesDir, 'wikibooks'), { recursive: true });
  const retrievedOn = osloDate(new Date());
  for (const { slug, title } of wanted) {
    await pause();
    const parsed = pageSchema.parse(
      await api({
        action: 'query',
        prop: 'revisions',
        rvprop: 'ids|timestamp|content',
        rvslots: 'main',
        titles: title,
      }),
    );
    const page = parsed.query.pages[0];
    const revision = page?.revisions?.[0];
    // Namespace 102 is "Cookbook:" on Wikibooks; anything else is not a recipe page.
    if (!page || page.missing || !revision || page.ns !== 102) {
      console.error(`${slug}: not found (${title})`);
      process.exitCode = 1;
      continue;
    }
    const pageUrl = `https://en.wikibooks.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`;
    writeFileSync(
      join(sourcesDir, 'wikibooks', `${slug}.json`),
      `${JSON.stringify(
        {
          title: page.title,
          pageId: page.pageid,
          revisionId: revision.revid,
          revisionTimestamp: revision.timestamp,
          url: pageUrl,
          revisionUrl: `https://en.wikibooks.org/w/index.php?oldid=${revision.revid}`,
          historyUrl: `https://en.wikibooks.org/w/index.php?title=${encodeURIComponent(page.title)}&action=history`,
          license: 'CC-BY-SA-4.0',
          licenseUrl: EXPECTED_LICENSE,
          retrievedOn,
          wikitext: revision.slots.main.content,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`${slug}: revision ${revision.revid}`);
  }
}

await main();
