import type { RouteObject } from 'react-router';
import { GuestOnly, RequireAuth } from '../auth/RequireAuth';
import { AppShell } from '../layout/AppShell';
import { AuthLayout } from '../layout/AuthLayout';
import { DesignSystemPage } from '../pages/DesignSystemPage';
import { MorePage } from '../pages/MorePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OverviewPage } from '../pages/OverviewPage';
import { ProfilePage } from '../pages/ProfilePage';
import { SectionPage } from '../pages/SectionPage';
import { SettingsPage } from '../pages/SettingsPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { InventoryPage } from '../pages/inventory/InventoryPage';
import { ItemPage } from '../pages/inventory/ItemPage';
import { LocationsPage } from '../pages/inventory/LocationsPage';
import { NewItemPage } from '../pages/inventory/NewItemPage';
import {
  DESIGN_SYSTEM_PATH,
  LOCATIONS_PATH,
  LOGIN_PATH,
  MORE_PATH,
  NEW_ITEM_PATH,
  PROFILE_PATH,
  REGISTER_PATH,
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
          { path: 'skann', element: <SectionPage section="scan" /> },
          { path: 'oppskrifter', element: <SectionPage section="recipes" /> },
          { path: 'handleliste', element: <SectionPage section="shoppingList" /> },
          { path: 'budsjett', element: <SectionPage section="budget" /> },
          { path: 'maltidsplan', element: <SectionPage section="mealPlan" /> },
          { path: 'husholdning', element: <SectionPage section="household" /> },
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
