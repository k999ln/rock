/** Keep old history responses from overwriting mutations or a newer auth result. */
export function createCsvHistoryRequest() {
  let generation = 0;
  let mutations = 0;
  let controller: AbortController | null = null;
  const invalidate = () => {
    generation++;
    controller?.abort();
    controller = null;
  };
  return {
    invalidate,
    mutate() {
      invalidate();
      mutations++;
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        invalidate();
        mutations--;
      };
    },
    begin() {
      if (mutations) return null;
      invalidate();
      const id = generation;
      controller = new AbortController();
      return { signal: controller.signal, current: () => id === generation };
    },
  };
}
