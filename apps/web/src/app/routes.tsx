import type { RouteObject } from 'react-router';
import { AppShell } from '../layout/AppShell';
import { DesignSystemPage } from '../pages/DesignSystemPage';
import { MorePage } from '../pages/MorePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OverviewPage } from '../pages/OverviewPage';
import { SectionPage } from '../pages/SectionPage';
import { SettingsPage } from '../pages/SettingsPage';
import { DESIGN_SYSTEM_PATH, MORE_PATH } from './navigation';

/** All routes, shared by the browser router (main.tsx) and the memory router in tests. */
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'matlager', element: <SectionPage section="inventory" /> },
      { path: 'skann', element: <SectionPage section="scan" /> },
      { path: 'oppskrifter', element: <SectionPage section="recipes" /> },
      { path: 'handleliste', element: <SectionPage section="shoppingList" /> },
      { path: 'budsjett', element: <SectionPage section="budget" /> },
      { path: 'maltidsplan', element: <SectionPage section="mealPlan" /> },
      { path: 'husholdning', element: <SectionPage section="household" /> },
      { path: 'innstillinger', element: <SettingsPage /> },
      { path: MORE_PATH.slice(1), element: <MorePage /> },
      { path: DESIGN_SYSTEM_PATH.slice(1), element: <DesignSystemPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
