/**
 * Unit tests for `src/show-hidden-files.ts` — assert the file-explorer rename-method
 * detection order (`saveRename` ≥1.13.7 → `acceptRename` ≤1.12.7 → `finishRename` ancient).
 *
 * `patchFileExplorer` is not exported, so we drive it through its public surface: mock
 * `monkey-around`'s `around` to capture the patched key, and mock `revealPrivateFilter` to
 * forward the workspace into the patch callback. Each case supplies a view prototype that
 * exposes exactly one of the three rename methods and asserts the detection picks that one
 * (never an absent key, which would install a throwing stub via monkey-around).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type RenameMethod = "saveRename" | "acceptRename" | "finishRename";

const capturedKeys: string[] = [];

vi.mock("monkey-around", () => ({
  around: vi.fn((_obj: unknown, factories: Record<string, unknown>) => {
    capturedKeys.push(...Object.keys(factories));
    return vi.fn();
  }),
}));

vi.mock("@polyipseity/obsidian-plugin-library", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@polyipseity/obsidian-plugin-library")
    >();
  const mock: Record<string, unknown> = {
    ...actual,
    revealPrivateFilter:
      () =>
      (
        _context: unknown,
        args: unknown[],
        func: (...funcArgs: unknown[]) => unknown,
        fallback: (error: unknown) => unknown,
      ): unknown =>
        func(args[0]) ?? fallback(new Error("no private")),
  };
  return mock;
});

function makeContext(present: RenameMethod): {
  context: {
    app: { workspace: unknown };
    register: () => void;
  };
  filter: { test: () => boolean };
} {
  // Only the present rename method exists on the prototype, mirroring a real Obsidian build.
  const viewPrototype: Partial<Record<RenameMethod, unknown>> = {
    [present]: vi.fn(),
  };
  const view = Object.create(viewPrototype) as Record<string, unknown>;
  const leaf = { view };
  const workspace = {
    onLayoutReady: (cb: () => void) => {
      cb();
    },
    getLeavesOfType: () => [leaf],
    on: () => vi.fn(),
  };
  return {
    context: { app: { workspace }, register: vi.fn() },
    filter: { test: () => true },
  };
}

describe("src/show-hidden-files.ts rename-method detection", () => {
  afterEach(() => {
    capturedKeys.length = 0;
    vi.clearAllMocks();
  });

  for (const present of [
    "saveRename",
    "acceptRename",
    "finishRename",
  ] as const) {
    it(`patches the existing rename method when only ${present} is present`, async () => {
      const { context, filter } = makeContext(present);
      const { patchFileExplorer } =
        await import("../../src/show-hidden-files.js");
      patchFileExplorer(context as never, filter as never);
      expect(capturedKeys).toEqual([present]);
    });
  }
});
