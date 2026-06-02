export type DestructiveBatchJob = {
  id: string;
  status: "queued" | "paused" | "running" | "done" | "error" | "canceled";
};

export function resolveDestructiveBatchState<T extends DestructiveBatchJob>(
  jobIds: string[],
  jobs: T[],
):
  | { state: "waiting"; jobs: T[] }
  | { state: "blocked"; jobs: T[] }
  | { state: "ready"; jobs: T[] };

export function writeReplacementsWithRollback<
  T extends { blob: unknown; original: unknown },
>(
  replacements: T[],
  actions: {
    backup: (replacement: T) => Promise<void>;
    write: (replacement: T, payload: unknown) => Promise<void>;
  },
): Promise<void>;
