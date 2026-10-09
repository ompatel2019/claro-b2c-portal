/** Bound eval I/O even when a client does not honour abort signals. */
export async function bounded<T>(
  operation: PromiseLike<T>,
  signal?: AbortSignal,
  timeoutMs = 20_000,
): Promise<T> {
  signal?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Eval I/O deadline exceeded")),
          timeoutMs,
        );
        abort = () => reject(signal!.reason);
        signal?.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}
