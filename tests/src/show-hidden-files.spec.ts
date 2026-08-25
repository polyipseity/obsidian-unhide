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
import type { $SyncPlugin } from "../../src/@types/obsidian.js";

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
    notice: vi.fn(),
    revealPrivateFilter:
      () =>
      (
        _context: unknown,
        args: unknown[],
        func: (...funcArgs: unknown[]) => unknown,
        fallback: (error: unknown) => unknown,
      ): unknown => {
        try {
          return func(...args) ?? fallback(new Error("no private"));
        } catch (error: unknown) {
          return fallback(error);
        }
      },
    revealPrivateAsyncFilter:
      () =>
      async (
        _context: unknown,
        args: unknown[],
        func: (...funcArgs: unknown[]) => unknown,
      ): Promise<unknown> =>
        func(...args),
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

/**
 * Unit tests for the Sync-safe guard (GH#35 (obsidian-unhide)).
 *
 * `hideFile`/`showFile`/`isSyncActive`/`reevaluateProtection` are driven through a fake `context`
 * shaped like `UnhidePlugin`: `app.internalPlugins.plugins.sync.getStatus()` reports the Sync
 * connection status, and `settings.value.protectSync` toggles the guard. The adapter is a fake whose
 * `reconcileDeletion` is a spy and `getRealPath` is identity. `revealPrivateFilter`/
 * `revealPrivateAsyncFilter` are mocked (see top of file) to forward the private member into the
 * callback, so `hideFile` reaches `adapter.reconcileDeletion` and `isSyncActive` reads the sync
 * plugin status. `notice` is mocked so we can assert the transition warning.
 *
 * `protectedHiddenPaths` and `lastProtectionActive` are module-scope state shared across calls and
 * tests. Because `lastProtectionActive` is module-scope, each test resets it by re-importing the
 * module under test with `vi.resetModules()` and re-importing `notice` from the mocked library.
 */
describe("src/show-hidden-files.ts Sync-safe guard (GH#35 (obsidian-unhide))", () => {
  const PATH = ".hidden/file.md";
  const PATH2 = ".hidden/other.md";

  interface FakeContext {
    app: {
      internalPlugins: {
        plugins: { sync?: { getStatus: () => $SyncPlugin.Status } };
      };
      vault: { adapter: FakeAdapter };
    };
    settings: { value: { protectSync: boolean } };
    register: () => void;
  }
  interface FakeAdapter {
    reconcileDeletion: ReturnType<typeof vi.fn>;
    reconcileFileInternal: ReturnType<typeof vi.fn>;
    getRealPath: (path: string) => string;
  }

  function makeContext(
    protectSync: boolean,
    syncStatus?: $SyncPlugin.Status,
  ): FakeContext {
    const adapter: FakeAdapter = {
      reconcileDeletion: vi.fn(),
      reconcileFileInternal: vi.fn(),
      getRealPath: (path: string): string => path,
    };
    return {
      app: {
        internalPlugins: {
          plugins: {
            ...(syncStatus === undefined
              ? {}
              : { sync: { getStatus: () => syncStatus } }),
          },
        },
        vault: { adapter },
      },
      settings: { value: { protectSync } },
      register: vi.fn(),
    };
  }

  // Reset module-scope state (`lastProtectionActive`) and mocks between tests.
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("hideFile calls reconcileDeletion when protectSync is OFF", async () => {
    const context = makeContext(false, "synced");
    const { hideFile } = await import("../../src/show-hidden-files.js");
    await hideFile(context as never, PATH);
    expect(
      context.app.vault.adapter.reconcileDeletion,
    ).toHaveBeenCalledExactlyOnceWith(PATH, PATH);
  });

  it("hideFile does NOT call reconcileDeletion when ON and Sync active", async () => {
    const context = makeContext(true, "synced");
    const { hideFile } = await import("../../src/show-hidden-files.js");
    await hideFile(context as never, PATH);
    expect(context.app.vault.adapter.reconcileDeletion).not.toHaveBeenCalled();
  });

  it("hideFile DOES call reconcileDeletion when ON but Sync not active", async () => {
    const context = makeContext(true, "disconnected");
    const { hideFile } = await import("../../src/show-hidden-files.js");
    await hideFile(context as never, PATH);
    expect(
      context.app.vault.adapter.reconcileDeletion,
    ).toHaveBeenCalledExactlyOnceWith(PATH, PATH);
  });

  it("showFile always reconciles the file back into the index", async () => {
    const context = makeContext(true, "synced");
    const { showFile } = await import("../../src/show-hidden-files.js");
    await showFile(context as never, PATH);
    expect(
      context.app.vault.adapter.reconcileFileInternal,
    ).toHaveBeenCalledExactlyOnceWith(PATH, PATH);
    expect(context.app.vault.adapter.reconcileDeletion).not.toHaveBeenCalled();
  });

  it("shows the notice only on the transition to active protection, not per blocked file", async () => {
    const { notice } = await import("@polyipseity/obsidian-plugin-library");
    const { reevaluateProtection } =
      await import("../../src/show-hidden-files.js");
    // Establish inactive baseline (protection off).
    reevaluateProtection(makeContext(false, "synced") as never);
    expect(notice).not.toHaveBeenCalled();
    // Transition to active (protection on + Sync active): notice fires once.
    const on = makeContext(true, "synced");
    reevaluateProtection(on as never);
    reevaluateProtection(on as never);
    expect(notice).toHaveBeenCalledTimes(1);
  });

  it("flushes all pending paths when protection turns off", async () => {
    const { notice } = await import("@polyipseity/obsidian-plugin-library");
    const { hideFile, reevaluateProtection } =
      await import("../../src/show-hidden-files.js");
    const on = makeContext(true, "synced");
    await hideFile(on as never, PATH);
    await hideFile(on as never, PATH2);
    expect(on.app.vault.adapter.reconcileDeletion).not.toHaveBeenCalled();
    // Activate protection, then deactivate -> flush runs on the context that triggered it.
    reevaluateProtection(on as never);
    const off = makeContext(false, "synced");
    reevaluateProtection(off as never);
    expect(off.app.vault.adapter.reconcileDeletion).toHaveBeenCalledWith(
      PATH,
      PATH,
    );
    expect(off.app.vault.adapter.reconcileDeletion).toHaveBeenCalledWith(
      PATH2,
      PATH2,
    );
    // Notice fired once on the inactive->active transition, not on flush.
    expect(notice).toHaveBeenCalledTimes(1);
  });

  it("showFile drops a path from the pending set so it is not flushed", async () => {
    const { hideFile, showFile, reevaluateProtection } =
      await import("../../src/show-hidden-files.js");
    const on = makeContext(true, "synced");
    await hideFile(on as never, PATH);
    await showFile(on as never, PATH);
    // Activate then deactivate: PATH was dropped from the pending set, so nothing flushes.
    reevaluateProtection(on as never);
    const off = makeContext(false, "synced");
    reevaluateProtection(off as never);
    expect(on.app.vault.adapter.reconcileDeletion).not.toHaveBeenCalled();
  });

  it("isSyncActive returns true when Sync is active", async () => {
    const context = makeContext(true, "synced");
    const { isSyncActive } = await import("../../src/show-hidden-files.js");
    expect(isSyncActive(context as never)).toBe(true);
  });

  it("isSyncActive returns false when Sync is not active", async () => {
    const context = makeContext(true, "disconnected");
    const { isSyncActive } = await import("../../src/show-hidden-files.js");
    expect(isSyncActive(context as never)).toBe(false);
  });

  it("isSyncActive falls back to false when the sync plugin is absent", async () => {
    const context = makeContext(true);
    const { isSyncActive } = await import("../../src/show-hidden-files.js");
    expect(isSyncActive(context as never)).toBe(false);
  });
});
