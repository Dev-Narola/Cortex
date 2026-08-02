import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { useRafStream } from "@/lib/streaming/use-raf-stream";

describe("useRafStream", () => {
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    // happy-dom doesn't ship rAF; mock it.
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      },
    );
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("coalesces tokens until the next frame", () => {
    const { result } = renderHook(() => useRafStream());
    act(() => {
      result.current.append("hello ");
      result.current.append("world");
    });
    // Not flushed yet — the frame hasn't run.
    expect(result.current.text).toBe("");
    expect(rafCallbacks).toHaveLength(1);
    act(() => {
      rafCallbacks.forEach((cb) => cb(performance.now()));
    });
    expect(result.current.text).toBe("hello world");
  });

  it("schedules only one frame per burst", () => {
    const { result } = renderHook(() => useRafStream());
    act(() => {
      result.current.append("a");
      result.current.append("b");
      result.current.append("c");
    });
    expect(rafCallbacks).toHaveLength(1);
  });

  it("reset clears the buffer and the text", () => {
    const { result } = renderHook(() => useRafStream());
    act(() => {
      result.current.append("abc");
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.text).toBe("");
  });
});
