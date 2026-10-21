import type { IconName } from '../components/Icon/Icon';

export type SectionId =
  | 'overview'
  | 'inventory'
  | 'scan'
  | 'recipes'
  | 'shoppingList'
  | 'budget'
  | 'mealPlan'
  | 'household'
  | 'settings';

export interface NavSection {
  id: SectionId;
  /** Norwegian URL, also used when the interface is in English. */
  path: string;
  icon: IconName;
  /** One of the four sections in the phone's bottom navigation (the fifth slot is "Mer"). */
  inBottomNav: boolean;
  /** Planned for a later phase (see roadmap); shown with a "Kommer senere" label. */
  comingLater?: boolean;
}

/** The nine sections of SmartMat, in menu order. Single source for routes, side menu, bottom menu and "Mer". */
export const SECTIONS: readonly NavSection[] = [
  { id: 'overview', path: '/', icon: 'overview', inBottomNav: true },
  { id: 'inventory', path: '/matlager', icon: 'inventory', inBottomNav: true },
  { id: 'scan', path: '/skann', icon: 'scan', inBottomNav: true },
  { id: 'recipes', path: '/oppskrifter', icon: 'recipes', inBottomNav: true },
  { id: 'shoppingList', path: '/handleliste', icon: 'shoppingList', inBottomNav: false },
  { id: 'budget', path: '/budsjett', icon: 'budget', inBottomNav: false },
  { id: 'mealPlan', path: '/maltidsplan', icon: 'mealPlan', inBottomNav: false, comingLater: true },
  {
    id: 'household',
    path: '/husholdning',
    icon: 'household',
    inBottomNav: false,
    comingLater: true,
  },
  { id: 'settings', path: '/innstillinger', icon: 'settings', inBottomNav: false },
];

export const MORE_PATH = '/mer';
export const DESIGN_SYSTEM_PATH = '/designsystem';
export const LOGIN_PATH = '/logg-inn';
export const REGISTER_PATH = '/registrer';
export const PROFILE_PATH = '/profil';
export const INVENTORY_PATH = '/matlager';
export const NEW_ITEM_PATH = '/matlager/ny';
export const LOCATIONS_PATH = '/matlager/steder';
export const itemPath = (itemId: string) => `/matlager/${itemId}`;
export const RECIPES_PATH = '/oppskrifter';
export const recipePath = (recipeId: string) => `/oppskrifter/${recipeId}`;
export const BUDGET_PATH = '/budsjett';
export const NEW_PURCHASE_PATH = '/budsjett/kjop/ny';
export const purchasePath = (purchaseId: string) => `/budsjett/kjop/${purchaseId}`;
export const editPurchasePath = (purchaseId: string) => `/budsjett/kjop/${purchaseId}/rett`;
/** The budget page for a month ("2026-09"); the month is in the URL so it can be shared and reloaded. */
export const budgetMonthPath = (month: string) => `${BUDGET_PATH}?maned=${month}`;

export const BOTTOM_NAV_SECTIONS = SECTIONS.filter((section) => section.inBottomNav);
export const MORE_SECTIONS = SECTIONS.filter((section) => !section.inBottomNav);
