export type WorkbenchProjectMeta = {
  id: string;
  name: string;
  updatedAt: number;
  createdAt?: number;
};

export type WorkbenchProjectStoreSnapshot = {
  currentProjectId: string;
  projects: WorkbenchProjectMeta[];
};

export const WORKBENCH_NEW_PROJECT_TARGET = '__new_workbench_project__';

const WORKBENCH_PROJECT_STORE_KEY_PREFIX = 'vflow_workbench_projects_v1';
const DEFAULT_PROJECT_ID = 'project_alpha_01';
const DEFAULT_PROJECT_NAME = 'Project_Alpha_01';

const buildFallbackStore = (): WorkbenchProjectStoreSnapshot => ({
  currentProjectId: DEFAULT_PROJECT_ID,
  projects: [{
    id: DEFAULT_PROJECT_ID,
    name: DEFAULT_PROJECT_NAME,
    updatedAt: Date.now(),
    createdAt: Date.now(),
  }],
});

const normalizeStore = (raw: Partial<WorkbenchProjectStoreSnapshot> | null | undefined): WorkbenchProjectStoreSnapshot => {
  if (!raw || typeof raw !== 'object') return buildFallbackStore();
  if (!Array.isArray(raw.projects) || raw.projects.length === 0) return buildFallbackStore();

  const projects = raw.projects
    .map((item) => {
      const id = String(item?.id || '').trim();
      if (!id) return null;

      const name = String(item?.name || '').trim() || DEFAULT_PROJECT_NAME;
      const updatedAtRaw = Number(item?.updatedAt);
      const createdAtRaw = Number(item?.createdAt);
      const updatedAt = Number.isFinite(updatedAtRaw) ? updatedAtRaw : Date.now();
      const createdAt = Number.isFinite(createdAtRaw) ? createdAtRaw : updatedAt;

      return {
        id,
        name,
        updatedAt,
        createdAt,
      } satisfies WorkbenchProjectMeta;
    })
    .filter(Boolean) as WorkbenchProjectMeta[];

  if (projects.length === 0) return buildFallbackStore();

  const currentProjectId = String(raw.currentProjectId || '').trim();
  const hasCurrent = projects.some((project) => project.id === currentProjectId);

  return {
    currentProjectId: hasCurrent ? currentProjectId : projects[0].id,
    projects,
  };
};

export const getWorkbenchProjectStoreKey = (userId?: string | number | null): string => {
  const normalized = userId === null || userId === undefined || userId === '' ? 'guest' : String(userId);
  return `${WORKBENCH_PROJECT_STORE_KEY_PREFIX}_${normalized}`;
};

export const resolveCurrentUserIdFromStorage = (): string | number | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem('vflow_ai_user');
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { id?: string | number };
    if (parsed?.id === null || parsed?.id === undefined || parsed?.id === '') return null;
    return parsed.id;
  } catch {
    return null;
  }
};

export const loadWorkbenchProjectStore = (userId?: string | number | null): WorkbenchProjectStoreSnapshot => {
  if (typeof window === 'undefined') return buildFallbackStore();

  const resolvedUserId = userId === undefined ? resolveCurrentUserIdFromStorage() : userId;

  try {
    const raw = window.localStorage.getItem(getWorkbenchProjectStoreKey(resolvedUserId));
    if (!raw) return buildFallbackStore();

    const parsed = JSON.parse(raw) as Partial<WorkbenchProjectStoreSnapshot>;
    return normalizeStore(parsed);
  } catch {
    return buildFallbackStore();
  }
};
