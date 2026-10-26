// Types partagés entre le front (React) et le serveur (Express).

export type Unit = 'pcs' | 'kg' | 'L' | 'pack';
export const UNITS: readonly Unit[] = ['pcs', 'kg', 'L', 'pack'] as const;

/** Mois au format "YYYY-MM" (ex: "2026-10"). */
export type MonthKey = string;

export interface Store {
  id: string;
  name: string;
  /** Couleur hexadécimale du badge (ex: "#dc2626"). */
  color: string;
  /** Logo / photo du magasin (URL locale ou data URL), optionnel. */
  photo?: string | null;
  createdAt: number;
}

export interface Product {
  id: string;
  name: string;
  /** Prix unitaire en DH. */
  price: number;
  quantity: number;
  unit: Unit;
  storeId: string | null;
  /** true = acheté, false = en attente. */
  checked: boolean;
  /** URL locale (/uploads/xxx.jpg) ou data URL base64 (hors-ligne), ou null. */
  photo: string | null;
  /** Notes / marques préférées. */
  notes: string;
  /** Article récurrent : conservé et décoché à la clôture du mois. */
  recurring: boolean;
  /**
   * Mois de la liste : null = mois en cours ; "YYYY-MM" postérieur = liste préparée
   * à l'avance (ex : courses de novembre faites fin octobre).
   */
  month?: MonthKey | null;
  /** Quantité déjà achetée (achat partiel). Absente = 0, ou toute la quantité si `checked`. */
  boughtQty?: number;
  /** Article ignoré pour ce mois : hors budget et hors liste à acheter. */
  skipped?: boolean;
  /** Article du mois référence dont il est issu (synchronisation prix/quantité). */
  refId?: string | null;
  createdAt: number;
  updatedAt: number;
  checkedAt: number | null;
}

/** Article du « mois référence » : la liste type, reprise automatiquement chaque mois. */
export interface RefItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  unit: Unit;
  storeId: string | null;
  notes: string;
  photo: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoreTotals {
  storeId: string | null;
  name: string;
  color: string;
  estimated: number;
  spent: number;
  count: number;
  checkedCount: number;
}

export interface ArchivedItem {
  name: string;
  price: number;
  quantity: number;
  unit: Unit;
  storeName: string;
  storeColor: string;
  checked: boolean;
  lineTotal: number;
}

export interface MonthArchive {
  month: MonthKey;
  archivedAt: number;
  estimated: number;
  spent: number;
  budget: number | null;
  /** Total du mois référence au moment de la clôture. */
  refEstimated?: number;
  itemCount: number;
  checkedCount: number;
  byStore: StoreTotals[];
  items: ArchivedItem[];
}

export interface FamilySettings {
  /** Budget mensuel cible en DH (optionnel). */
  monthlyBudget: number | null;
  /** Modifier le prix ou la quantité d'un article met aussi à jour le mois référence (défaut : oui). */
  syncReference?: boolean;
  /** Feuille Google Sheets de sauvegarde (identifiant). */
  backupSheetId?: string | null;
  /** Date de la dernière sauvegarde Google Sheets (ms). */
  backupAt?: number | null;
}

export interface FamilyData {
  code: string;
  /** Incrémenté par le serveur à chaque modification. */
  version: number;
  currentMonth: MonthKey;
  stores: Store[];
  products: Product[];
  history: MonthArchive[];
  /** Mois référence (liste type). */
  reference: RefItem[];
  settings: FamilySettings;
  /** Identifiants des dernières actions appliquées (idempotence + rebase optimiste). */
  lastActionIds: string[];
  updatedAt: number;
}

export type ProductPatch = Partial<Omit<Product, 'id' | 'createdAt'>>;

export type Action =
  | { type: 'product/add'; product: Product; toReference?: boolean }
  | { type: 'product/update'; id: string; patch: ProductPatch }
  | { type: 'product/delete'; id: string }
  | { type: 'product/setChecked'; id: string; checked: boolean }
  | { type: 'product/quantity'; id: string; delta: number }
  | { type: 'bulk/setChecked'; ids: string[]; checked: boolean }
  | { type: 'bulk/move'; ids: string[]; storeId: string | null }
  | { type: 'bulk/delete'; ids: string[] }
  | { type: 'store/add'; store: Store }
  | { type: 'store/update'; id: string; patch: Partial<Pick<Store, 'name' | 'color' | 'photo'>> }
  | { type: 'bulk/buy'; items: Array<{ id: string; qty: number }> }
  | { type: 'bulk/skip'; ids: string[]; skipped: boolean }
  | { type: 'bulk/setMonth'; ids: string[]; month: MonthKey | null }
  | { type: 'bulk/copyToMonth'; ids: string[]; month: MonthKey | null; newIds: string[] }
  | { type: 'store/delete'; id: string }
  | { type: 'month/close'; fromMonth: MonthKey; /** false = supprimer le mois sans l'archiver */ archive?: boolean }
  | { type: 'ref/add'; item: RefItem }
  | { type: 'ref/update'; id: string; patch: Partial<Omit<RefItem, 'id' | 'createdAt'>> }
  | { type: 'ref/delete'; ids: string[] }
  | { type: 'ref/fromProducts'; ids: string[] }
  | { type: 'ref/applyToMonth'; month: MonthKey | null }
  | { type: 'history/delete'; month: MonthKey }
  | { type: 'settings/update'; patch: Partial<FamilySettings> };

/** Enveloppe d'action : id unique (idempotence) + horodatage client. */
export interface ActionEnvelope {
  id: string;
  at: number;
  action: Action;
}

export interface ActionsResponse {
  data: FamilyData;
  /** Ids traités (appliqués ou déjà connus). */
  processed: string[];
  /** Ids rejetés (invalides). */
  rejected: string[];
}
