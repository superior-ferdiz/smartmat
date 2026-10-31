import { lazyPage } from './lazyPage';

/* Spec 13 (NFR-PERF-001): one lazily loaded file per page. routes.tsx uses these; the test setup preloads them all. */

export const pages = {
  LoginPage: lazyPage(() => import('../pages/auth/LoginPage'), 'LoginPage'),
  RegisterPage: lazyPage(() => import('../pages/auth/RegisterPage'), 'RegisterPage'),
  ForgotPasswordPage: lazyPage(
    () => import('../pages/auth/ForgotPasswordPage'),
    'ForgotPasswordPage',
  ),
  ResetPasswordPage: lazyPage(() => import('../pages/auth/ResetPasswordPage'), 'ResetPasswordPage'),
  JoinPage: lazyPage(() => import('../pages/household/JoinPage'), 'JoinPage'),
  OverviewPage: lazyPage(() => import('../pages/OverviewPage'), 'OverviewPage'),
  InventoryPage: lazyPage(() => import('../pages/inventory/InventoryPage'), 'InventoryPage'),
  NewItemPage: lazyPage(() => import('../pages/inventory/NewItemPage'), 'NewItemPage'),
  LocationsPage: lazyPage(() => import('../pages/inventory/LocationsPage'), 'LocationsPage'),
  ItemPage: lazyPage(() => import('../pages/inventory/ItemPage'), 'ItemPage'),
  ScanPage: lazyPage(() => import('../pages/scan/ScanPage'), 'ScanPage'),
  RecipesPage: lazyPage(() => import('../pages/recipes/RecipesPage'), 'RecipesPage'),
  RecipeSourcesPage: lazyPage(
    () => import('../pages/recipes/RecipeSourcesPage'),
    'RecipeSourcesPage',
  ),
  RecipePage: lazyPage(() => import('../pages/recipes/RecipePage'), 'RecipePage'),
  NewRecipePage: lazyPage(() => import('../pages/recipes/RecipeFormPages'), 'NewRecipePage'),
  EditRecipePage: lazyPage(() => import('../pages/recipes/RecipeFormPages'), 'EditRecipePage'),
  ShoppingListPage: lazyPage(
    () => import('../pages/shopping/ShoppingListPage'),
    'ShoppingListPage',
  ),
  BudgetPage: lazyPage(() => import('../pages/budget/BudgetPage'), 'BudgetPage'),
  NewPurchasePage: lazyPage(() => import('../pages/budget/NewPurchasePage'), 'NewPurchasePage'),
  PurchasePage: lazyPage(() => import('../pages/budget/PurchasePage'), 'PurchasePage'),
  EditPurchasePage: lazyPage(() => import('../pages/budget/EditPurchasePage'), 'EditPurchasePage'),
  ReceiptsPage: lazyPage(() => import('../pages/receipts/ReceiptsPage'), 'ReceiptsPage'),
  ReceiptPage: lazyPage(() => import('../pages/receipts/ReceiptPage'), 'ReceiptPage'),
  MealPlanPage: lazyPage(() => import('../pages/mealplan/MealPlanPage'), 'MealPlanPage'),
  WastePage: lazyPage(() => import('../pages/waste/WastePage'), 'WastePage'),
  NotificationsPage: lazyPage(
    () => import('../pages/notifications/NotificationsPage'),
    'NotificationsPage',
  ),
  HouseholdPage: lazyPage(() => import('../pages/household/HouseholdPage'), 'HouseholdPage'),
  SettingsPage: lazyPage(() => import('../pages/SettingsPage'), 'SettingsPage'),
  MorePage: lazyPage(() => import('../pages/MorePage'), 'MorePage'),
  ProfilePage: lazyPage(() => import('../pages/ProfilePage'), 'ProfilePage'),
  PrivacyPage: lazyPage(() => import('../pages/PrivacyPage'), 'PrivacyPage'),
  DesignSystemPage: lazyPage(() => import('../pages/DesignSystemPage'), 'DesignSystemPage'),
};

export async function preloadAllPages() {
  await Promise.all(Object.values(pages).map((page) => page.preload()));
}
