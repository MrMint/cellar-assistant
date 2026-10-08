/**
 * Which `getUserMedia` request is still wanted.
 *
 * A camera request can take seconds to answer — longer than the five the
 * start timeout waits (N04), and on an iOS home-screen app it may sit on the
 * permission prompt. Meanwhile the person can press "Try again" (a second
 * request), or "Skip" (the scanner unmounts). Without this, the stream that
 * answered a request nobody wanted any more was adopted anyway: it was never
 * stopped, so the camera stayed on — the indicator lit — after the scanner was
 * gone, or alongside the retry's own stream.
 *
 * Each request takes a ticket from {@link StreamGate.begin}; `cancel()` (the
 * scanner stopping) voids every ticket issued so far. A stream that arrives
 * on a void ticket is stopped on the spot by {@link StreamGate.adopt}.
 *
 * Plain module: no React, no DOM — the tracks need only `stop()`.
 */

/** As much of a `MediaStream` as the gate touches. */
export type StoppableStream = {
  getTracks(): readonly { stop(): void }[];
};

export type StreamGate = {
  /** A ticket for a new request; voids any earlier one still pending. */
  begin(): number;
  /** Voids every ticket issued so far (the scanner stopped). */
  cancel(): void;
  /** Whether `ticket` is still the request that is wanted. */
  isCurrent(ticket: number): boolean;
  /**
   * `true` when `stream` answered the current request and may be used;
   * otherwise its tracks are stopped and `false` is returned.
   */
  adopt(ticket: number, stream: StoppableStream): boolean;
};

export const stopStream = (stream: StoppableStream): void => {
  for (const track of stream.getTracks()) {
    track.stop();
  }
};

export const createStreamGate = (): StreamGate => {
  let current = 0;
  return {
    begin: () => {
      current += 1;
      return current;
    },
    cancel: () => {
      current += 1;
    },
    isCurrent: (ticket) => ticket === current,
    adopt: (ticket, stream) => {
      if (ticket === current) return true;
      stopStream(stream);
      return false;
    },
  };
};
