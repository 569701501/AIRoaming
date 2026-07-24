export interface LayoutSaveContext {
  projectId: string;
  chapterId: string;
  loadGeneration: number;
}

export interface AwaitableLayoutSaveFlight {
  joinCurrent(): Promise<void> | null;
  start(save: () => Promise<void>): Promise<void>;
}

export function sameLayoutSaveContext(left: LayoutSaveContext, right: LayoutSaveContext): boolean {
  return left.projectId === right.projectId
    && left.chapterId === right.chapterId
    && left.loadGeneration === right.loadGeneration;
}

export function createAwaitableLayoutSaveFlight(): AwaitableLayoutSaveFlight {
  let current: Promise<void> | null = null;
  return {
    joinCurrent: () => current,
    start(save) {
      if (current) return current;
      const flight = Promise.resolve().then(save);
      current = flight;
      const clear = () => {
        if (current === flight) current = null;
      };
      void flight.then(clear, clear);
      return flight;
    },
  };
}

export async function commitLayoutSaveResultIfCurrent<TResult>(input: {
  captured: LayoutSaveContext;
  current(): LayoutSaveContext;
  save(): Promise<TResult>;
  commit(result: TResult): void;
}): Promise<"committed" | "stale"> {
  const result = await input.save();
  if (!sameLayoutSaveContext(input.captured, input.current())) return "stale";
  input.commit(result);
  return "committed";
}
