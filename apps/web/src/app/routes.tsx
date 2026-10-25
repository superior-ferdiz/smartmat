import type { RouteObject } from 'react-router';
import { GuestOnly, RequireAuth } from '../auth/RequireAuth';
import { AppShell } from '../layout/AppShell';
import { AuthLayout } from '../layout/AuthLayout';
import { DesignSystemPage } from '../pages/DesignSystemPage';
import { MorePage } from '../pages/MorePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OverviewPage } from '../pages/OverviewPage';
import { ProfilePage } from '../pages/ProfilePage';
import { SettingsPage } from '../pages/SettingsPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { HouseholdPage } from '../pages/household/HouseholdPage';
import { JoinPage } from '../pages/household/JoinPage';
import { InventoryPage } from '../pages/inventory/InventoryPage';
import { ItemPage } from '../pages/inventory/ItemPage';
import { LocationsPage } from '../pages/inventory/LocationsPage';
import { NewItemPage } from '../pages/inventory/NewItemPage';
import { BudgetPage } from '../pages/budget/BudgetPage';
import { EditPurchasePage } from '../pages/budget/EditPurchasePage';
import { NewPurchasePage } from '../pages/budget/NewPurchasePage';
import { PurchasePage } from '../pages/budget/PurchasePage';
import { ReceiptPage } from '../pages/receipts/ReceiptPage';
import { ReceiptsPage } from '../pages/receipts/ReceiptsPage';
import { MealPlanPage } from '../pages/mealplan/MealPlanPage';
import { RecipePage } from '../pages/recipes/RecipePage';
import { RecipeSourcesPage } from '../pages/recipes/RecipeSourcesPage';
import { RecipesPage } from '../pages/recipes/RecipesPage';
import { ScanPage } from '../pages/scan/ScanPage';
import { ShoppingListPage } from '../pages/shopping/ShoppingListPage';
import { NotificationsPage } from '../pages/notifications/NotificationsPage';
import { WastePage } from '../pages/waste/WastePage';
import {
  BUDGET_PATH,
  DESIGN_SYSTEM_PATH,
  HOUSEHOLD_PATH,
  JOIN_PATH,
  LOCATIONS_PATH,
  LOGIN_PATH,
  MEAL_PLAN_PATH,
  MORE_PATH,
  NEW_ITEM_PATH,
  NEW_PURCHASE_PATH,
  NOTIFICATIONS_PATH,
  PROFILE_PATH,
  RECEIPTS_PATH,
  RECIPE_SOURCES_PATH,
  RECIPES_PATH,
  REGISTER_PATH,
  SCAN_PATH,
  SHOPPING_LIST_PATH,
  WASTE_PATH,
} from './navigation';

/** All routes, shared by the browser router (main.tsx) and the memory router in tests. */
export const routes: RouteObject[] = [
  {
    // Login and registration: no menus.
    element: <AuthLayout />,
    children: [
      {
        path: LOGIN_PATH.slice(1),
        element: (
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        ),
      },
      {
        path: REGISTER_PATH.slice(1),
        element: (
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        ),
      },
      // Spec 10: open both logged in and out (the page itself asks the logged-out visitor to log in).
      { path: JOIN_PATH.slice(1), element: <JoinPage /> },
    ],
  },
  {
    element: <AppShell />,
    children: [
      {
        // Everything with user data needs a logged-in user (phase 2).
        element: <RequireAuth />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'matlager', element: <InventoryPage /> },
          { path: NEW_ITEM_PATH.slice(1), element: <NewItemPage /> },
          { path: LOCATIONS_PATH.slice(1), element: <LocationsPage /> },
          { path: 'matlager/:itemId', element: <ItemPage /> },
          { path: SCAN_PATH.slice(1), element: <ScanPage /> },
          { path: RECIPES_PATH.slice(1), element: <RecipesPage /> },
          { path: RECIPE_SOURCES_PATH.slice(1), element: <RecipeSourcesPage /> },
          { path: 'oppskrifter/:recipeId', element: <RecipePage /> },
          { path: SHOPPING_LIST_PATH.slice(1), element: <ShoppingListPage /> },
          { path: BUDGET_PATH.slice(1), element: <BudgetPage /> },
          { path: NEW_PURCHASE_PATH.slice(1), element: <NewPurchasePage /> },
          { path: 'budsjett/kjop/:purchaseId', element: <PurchasePage /> },
          { path: 'budsjett/kjop/:purchaseId/rett', element: <EditPurchasePage /> },
          { path: RECEIPTS_PATH.slice(1), element: <ReceiptsPage /> },
          { path: `${RECEIPTS_PATH.slice(1)}/:receiptId`, element: <ReceiptPage /> },
          { path: MEAL_PLAN_PATH.slice(1), element: <MealPlanPage /> },
          { path: WASTE_PATH.slice(1), element: <WastePage /> },
          { path: NOTIFICATIONS_PATH.slice(1), element: <NotificationsPage /> },
          { path: HOUSEHOLD_PATH.slice(1), element: <HouseholdPage /> },
          { path: 'innstillinger', element: <SettingsPage /> },
          { path: MORE_PATH.slice(1), element: <MorePage /> },
          { path: PROFILE_PATH.slice(1), element: <ProfilePage /> },
        ],
      },
      // Public: the design system is a demo page without user data, and 404 should never redirect.
      { path: DESIGN_SYSTEM_PATH.slice(1), element: <DesignSystemPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
