import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimitPlugin from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { DestinationStream } from 'pino';
import { API_ERRORS } from '@smartmat/shared';
import type { AppConfig } from './config';
import type { Db } from './db';
import { createHouseholdAccess } from './authz/household';
import { systemClock, type Clock } from './lib/clock';
import { AppError } from './lib/errors';
import { WindowLimiter } from './lib/windowLimiter';
import { createAuthRepo } from './modules/auth/repo';
import { createBarcodeRepo } from './modules/barcodes/repo';
import { barcodeRoutes } from './modules/barcodes/routes';
import { BarcodeService } from './modules/barcodes/service';
import { authRoutes } from './modules/auth/routes';
import { argon2Hasher, type PasswordHasher } from './modules/auth/password';
import { AuthService } from './modules/auth/service';
import { healthRoutes } from './modules/health/routes';
import { createInventoryRepo } from './modules/inventory/repo';
import { inventoryRoutes } from './modules/inventory/routes';
import { InventoryService } from './modules/inventory/service';
import { categoryRoutes } from './modules/locations/categories';
import { createLocationRepo } from './modules/locations/repo';
import { locationRoutes } from './modules/locations/routes';
import { createBudgetRepo } from './modules/budget/repo';
import { budgetRoutes } from './modules/budget/routes';
import { BudgetService } from './modules/budget/service';
import { createHouseholdRepo } from './modules/households/repo';
import { householdRoutes } from './modules/households/routes';
import { HouseholdService } from './modules/households/service';
import { createProfileRepo } from './modules/profile/repo';
import { createPurchaseRepo } from './modules/purchases/repo';
import { createMealPlanRepo } from './modules/mealplan/repo';
import { mealPlanRoutes } from './modules/mealplan/routes';
import { MealPlanService } from './modules/mealplan/service';
import { createRecipeRepo } from './modules/recipes/repo';
import { recipeRoutes } from './modules/recipes/routes';
import { RecipeService } from './modules/recipes/service';
import { purchaseRoutes } from './modules/purchases/routes';
import { createShoppingRepo } from './modules/shopping/repo';
import { shoppingRoutes } from './modules/shopping/routes';
import { ShoppingService } from './modules/shopping/service';
import { PurchaseService } from './modules/purchases/service';
import { profileRoutes } from './modules/profile/routes';
import { ProfileService } from './modules/profile/service';
import { createReceiptRepo } from './modules/receipts/repo';
import { receiptRoutes } from './modules/receipts/routes';
import { ReceiptService, type ReceiptQueue } from './modules/receipts/service';
import {
  createRequireAuth,
  createSessionCookies,
  HOST_SESSION_COOKIE,
  registerAuthDecorations,
  SESSION_COOKIE,
} from './plugins/auth';
import { registerErrorHandling } from './plugins/errors';
import { registerOriginCheck } from './plugins/origin';
import {
  inlineScriptHashes,
  isPageRequest,
  readIndexHtml,
  registerWebApp,
  webCsp,
} from './plugins/web';
import { createOpenFoodFactsProvider } from './providers/barcode/openFoodFacts';
import { disabledBarcodeProvider, type BarcodeProvider } from './providers/barcode/types';

export interface AppDeps {
  config: AppConfig;
  db: Db;
  /** Tests pass a fake clock to move time forward. */
  now?: Clock;
  hasher?: PasswordHasher;
  /** Tests capture the log here to check that it contains no personal data. */
  logStream?: DestinationStream;
  /** Tests pass a fake; otherwise Open Food Facts if a User-Agent is configured (spec 07). */
  barcodeProvider?: BarcodeProvider;
  /** Spec 08: where uploaded receipts go for the worker. server.ts passes pg-boss; tests pass a fake. */
  receiptQueue?: ReceiptQueue;
}

/** Without a queue, an upload is refused before anything is saved (the API was started without OCR). */
const noReceiptQueue: ReceiptQueue = {
  enqueue: () => Promise.reject(new Error('no receipt queue configured')),
};

const MINUTE = 60_000;

/** Open Food Facts requires a User-Agent with a contact. Without one, lookups are switched off (manual form). */
function defaultBarcodeProvider(config: AppConfig, now: Clock): BarcodeProvider {
  const { offUserAgent, offBaseUrl, offTimeoutMs, offMaxPerMinute } = config.barcode;
  if (!offUserAgent) return disabledBarcodeProvider;
  return createOpenFoodFactsProvider({
    baseUrl: offBaseUrl,
    userAgent: offUserAgent,
    timeoutMs: offTimeoutMs,
    limiter: new WindowLimiter(offMaxPerMinute, MINUTE, now),
  });
}

export const API_PREFIX = '/api/v1';

/** Spec 07: a barcode says what a household has bought, so it is left out of the logged URL. */
export function redactUrl(url: string): string {
  return url.replace(/\/barcodes\/[^/?#]*/, '/barcodes/[gtin]').replace(/\?.*$/, '');
}

/** Builds the API without starting it (server.ts listens; tests use app.inject). */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const now = deps.now ?? systemClock;
  const hasher = deps.hasher ?? argon2Hasher;

  const app = Fastify({
    // Rate limits count the client's address. Locally X-Forwarded-For is NOT trusted: any client can set it,
    // and trusting it would let an attacker get a fresh limit per request. In the test environment only
    // Caddy's network is trusted (ADR-0015), and Caddy overwrites the header with the real address.
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
    logger: {
      level: config.logLevel,
      // NFR-SEC-004: no personal data in logs. Request bodies are never logged. The IP address is
      // personal data and is left out; headers that carry secrets are censored if anything logs them.
      serializers: {
        req: (request) => ({ method: request.method, url: redactUrl(request.url) }),
      },
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          `req.headers["x-csrf-token"]`,
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
      ...(deps.logStream ? { stream: deps.logStream } : {}),
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const indexHtml = config.webDistDir ? readIndexHtml(config.webDistDir) : null;
  registerErrorHandling(
    app,
    indexHtml
      ? { html: indexHtml, isPage: (method, url) => isPageRequest(method, url, API_PREFIX) }
      : null,
  );
  registerAuthDecorations(app);

  // With the web app served from here, the CSP is for the page: our scripts, the hashed theme script, and
  // WebAssembly for the fallback barcode reader (ADR-0015). The API-only default is helmet's.
  await app.register(
    helmet,
    indexHtml
      ? { contentSecurityPolicy: { directives: webCsp(inlineScriptHashes(indexHtml)) } }
      : {},
  );
  // Spec 07: the camera only for our own page; nothing else the app does not use.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('permissions-policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  });
  await app.register(cookie);
  await app.register(rateLimitPlugin, {
    global: false,
    errorResponseBuilder: () => new AppError(429, API_ERRORS.rateLimited),
  });
  registerOriginCheck(app, config.allowedOrigins);

  const cookies = createSessionCookies(
    config.cookieSecure,
    config.cookieHostPrefix ? HOST_SESSION_COOKIE : SESSION_COOKIE,
  );
  const authService = new AuthService({ repo: createAuthRepo(db), hasher, now });
  const profileRepo = createProfileRepo(db);
  const profileService = new ProfileService({ repo: profileRepo, hasher });
  const householdRepo = createHouseholdRepo(db);
  const householdService = new HouseholdService({
    repo: householdRepo,
    passwords: profileRepo,
    hasher,
    invitationLimiter: new WindowLimiter(config.invitationAttemptsPerUser, 15 * MINUTE, now),
    now,
  });
  const requireAuth = createRequireAuth(authService, cookies);
  const householdAccess = createHouseholdAccess(householdRepo);
  const locationRepo = createLocationRepo(db);
  const inventoryRepo = createInventoryRepo(db);
  const recipeRepo = createRecipeRepo(db, config.recipes);
  const inventoryService = new InventoryService({
    repo: inventoryRepo,
    locations: locationRepo,
    ingredients: { exists: (id) => recipeRepo.ingredientExists(id) },
    now,
  });
  const recipeService = new RecipeService({
    repo: recipeRepo,
    inventory: inventoryRepo,
    households: householdService,
    now,
  });
  const purchaseService = new PurchaseService({
    repo: createPurchaseRepo(db),
    locations: locationRepo,
    now,
  });
  const budgetService = new BudgetService({ repo: createBudgetRepo(db), now });
  const barcodeService = new BarcodeService({
    repo: createBarcodeRepo(db),
    provider: deps.barcodeProvider ?? defaultBarcodeProvider(config, now),
    inventory: inventoryRepo,
    locations: locationRepo,
    ingredients: { exists: (id) => recipeRepo.ingredientExists(id) },
    userLimiter: new WindowLimiter(config.barcode.lookupsPerUserPerMinute, MINUTE, now),
    now,
  });
  const receiptService = new ReceiptService({
    repo: createReceiptRepo(db),
    purchases: purchaseService,
    queue: deps.receiptQueue ?? noReceiptQueue,
    config: {
      ...config.receipts,
      // No queue means no worker will ever read the receipt: say so instead of accepting the upload.
      ocrProvider: deps.receiptQueue ? config.receipts.ocrProvider : 'off',
    },
    uploadLimiter: new WindowLimiter(config.receipts.uploadsPerUserPerHour, 60 * MINUTE, now),
    now,
  });
  const shoppingRepo = createShoppingRepo(db);
  const shoppingService = new ShoppingService({
    repo: shoppingRepo,
    locations: locationRepo,
    recipes: recipeRepo,
    now,
  });
  const mealPlanService = new MealPlanService({
    repo: createMealPlanRepo(db),
    recipes: recipeRepo,
    inventory: inventoryRepo,
    shopping: shoppingRepo,
    households: householdService,
    now,
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes, { db });
      await api.register(authRoutes, {
        service: authService,
        cookies,
        requireAuth,
        rateLimits: config.rateLimits,
        registrationOpen: config.registrationOpen,
      });
      await api.register(profileRoutes, {
        service: profileService,
        cookies,
        requireAuth,
        rateLimits: config.rateLimits,
      });
      await api.register(householdRoutes, {
        service: householdService,
        profile: profileService,
        requireAuth,
        householdAccess,
        rateLimits: config.rateLimits,
      });
      await api.register(categoryRoutes, { db });
      await api.register(locationRoutes, { repo: locationRepo, requireAuth, householdAccess });
      await api.register(inventoryRoutes, {
        service: inventoryService,
        requireAuth,
        householdAccess,
      });
      await api.register(purchaseRoutes, {
        service: purchaseService,
        requireAuth,
        householdAccess,
      });
      await api.register(budgetRoutes, { service: budgetService, requireAuth, householdAccess });
      await api.register(recipeRoutes, { service: recipeService, requireAuth, householdAccess });
      await api.register(barcodeRoutes, { service: barcodeService, requireAuth, householdAccess });
      await api.register(receiptRoutes, { service: receiptService, requireAuth, householdAccess });
      await api.register(shoppingRoutes, {
        service: shoppingService,
        requireAuth,
        householdAccess,
      });
      await api.register(mealPlanRoutes, {
        service: mealPlanService,
        requireAuth,
        householdAccess,
      });
    },
    { prefix: API_PREFIX },
  );
  if (config.webDistDir) await registerWebApp(app, config.webDistDir);

  return app;
}
