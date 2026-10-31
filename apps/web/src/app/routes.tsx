import type { RouteObject } from 'react-router';
import { GuestOnly, RequireAuth } from '../auth/RequireAuth';
import { AppShell } from '../layout/AppShell';
import { AuthLayout } from '../layout/AuthLayout';
import { NotFoundPage } from '../pages/NotFoundPage';
import { pages } from './pages';
import {
  BUDGET_PATH,
  DESIGN_SYSTEM_PATH,
  FORGOT_PASSWORD_PATH,
  HOUSEHOLD_PATH,
  JOIN_PATH,
  LOCATIONS_PATH,
  LOGIN_PATH,
  MEAL_PLAN_PATH,
  MORE_PATH,
  NEW_ITEM_PATH,
  NEW_PURCHASE_PATH,
  NEW_RECIPE_PATH,
  NOTIFICATIONS_PATH,
  PASSWORD_RESET_PATH,
  PRIVACY_PATH,
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
            <pages.LoginPage />
          </GuestOnly>
        ),
      },
      {
        path: REGISTER_PATH.slice(1),
        element: (
          <GuestOnly>
            <pages.RegisterPage />
          </GuestOnly>
        ),
      },
      // Spec 17 (FR-AUTH-006a): someone who is logged in changes the password on the profile page instead.
      {
        path: FORGOT_PASSWORD_PATH.slice(1),
        element: (
          <GuestOnly>
            <pages.ForgotPasswordPage />
          </GuestOnly>
        ),
      },
      // Not GuestOnly: a redirect would lose the token in the fragment. A session here ends with the change anyway.
      { path: PASSWORD_RESET_PATH.slice(1), element: <pages.ResetPasswordPage /> },
      // Spec 10: open both logged in and out (the page itself asks the logged-out visitor to log in).
      { path: JOIN_PATH.slice(1), element: <pages.JoinPage /> },
    ],
  },
  {
    element: <AppShell />,
    children: [
      {
        // Everything with user data needs a logged-in user (phase 2).
        element: <RequireAuth />,
        children: [
          { index: true, element: <pages.OverviewPage /> },
          { path: 'matlager', element: <pages.InventoryPage /> },
          { path: NEW_ITEM_PATH.slice(1), element: <pages.NewItemPage /> },
          { path: LOCATIONS_PATH.slice(1), element: <pages.LocationsPage /> },
          { path: 'matlager/:itemId', element: <pages.ItemPage /> },
          { path: SCAN_PATH.slice(1), element: <pages.ScanPage /> },
          { path: RECIPES_PATH.slice(1), element: <pages.RecipesPage /> },
          { path: RECIPE_SOURCES_PATH.slice(1), element: <pages.RecipeSourcesPage /> },
          { path: NEW_RECIPE_PATH.slice(1), element: <pages.NewRecipePage /> },
          { path: 'oppskrifter/:recipeId', element: <pages.RecipePage /> },
          { path: 'oppskrifter/:recipeId/endre', element: <pages.EditRecipePage /> },
          { path: SHOPPING_LIST_PATH.slice(1), element: <pages.ShoppingListPage /> },
          { path: BUDGET_PATH.slice(1), element: <pages.BudgetPage /> },
          { path: NEW_PURCHASE_PATH.slice(1), element: <pages.NewPurchasePage /> },
          { path: 'budsjett/kjop/:purchaseId', element: <pages.PurchasePage /> },
          { path: 'budsjett/kjop/:purchaseId/rett', element: <pages.EditPurchasePage /> },
          { path: RECEIPTS_PATH.slice(1), element: <pages.ReceiptsPage /> },
          { path: `${RECEIPTS_PATH.slice(1)}/:receiptId`, element: <pages.ReceiptPage /> },
          { path: MEAL_PLAN_PATH.slice(1), element: <pages.MealPlanPage /> },
          { path: WASTE_PATH.slice(1), element: <pages.WastePage /> },
          { path: NOTIFICATIONS_PATH.slice(1), element: <pages.NotificationsPage /> },
          { path: HOUSEHOLD_PATH.slice(1), element: <pages.HouseholdPage /> },
          { path: 'innstillinger', element: <pages.SettingsPage /> },
          { path: MORE_PATH.slice(1), element: <pages.MorePage /> },
          { path: PROFILE_PATH.slice(1), element: <pages.ProfilePage /> },
        ],
      },
      // Public: the design system is a demo page without user data, and 404 should never redirect.
      { path: DESIGN_SYSTEM_PATH.slice(1), element: <pages.DesignSystemPage /> },
      // Spec 13 (FR-PRIV-003): the privacy notice, logged in or not.
      { path: PRIVACY_PATH.slice(1), element: <pages.PrivacyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
