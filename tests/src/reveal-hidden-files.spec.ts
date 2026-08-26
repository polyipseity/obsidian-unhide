/**
 * Unit tests for the Sync-safe guard (GH#35 (obsidian-unhide)).
 *
 * `hideFile`/`showFile`/`isSyncActive`/`reevaluateProtection` are driven through a fake `context`
 * shaped like `UnhidePlugin`: `app.internalPlugins.plugins.sync.instance.getStatus()` reports the Sync
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
import { afterEach, describe, expect, it, vi } from "vitest";
import type { $SyncPlugin } from "../../src/@types/obsidian.js";

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

describe("src/reveal-hidden-files.ts Sync-safe guard (GH#35 (obsidian-unhide))", () => {
  const PATH = ".hidden/file.md";
  const PATH2 = ".hidden/other.md";

  interface FakeContext {
    app: {
      internalPlugins: {
        plugins: {
          sync?: { instance: { getStatus: () => $SyncPlugin.Status } };
        };
      };
      vault: { adapter: FakeAdapter };
    };
    settings: { value: { protectSync: boolean; errorNoticeTimeout: number } };
    language: { value: { t: (key: string) => string } };
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
              : { sync: { instance: { getStatus: () => syncStatus } } }),
          },
        },
        vault: { adapter },
      },
      settings: { value: { protectSync, errorNoticeTimeout: 0 } },
      language: { value: { t: (key: string): string => key } },
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
    const { hideFile } = await import("../../src/reveal-hidden-files.js");
    await hideFile(context as never, PATH);
    expect(
      context.app.vault.adapter.reconcileDeletion,
    ).toHaveBeenCalledExactlyOnceWith(PATH, PATH);
  });

  it("hideFile does NOT call reconcileDeletion when ON and Sync active", async () => {
    const context = makeContext(true, "synced");
    const { hideFile } = await import("../../src/reveal-hidden-files.js");
    await hideFile(context as never, PATH);
    expect(context.app.vault.adapter.reconcileDeletion).not.toHaveBeenCalled();
  });

  it("hideFile DOES call reconcileDeletion when ON but Sync not active", async () => {
    const context = makeContext(true, "disconnected");
    const { hideFile } = await import("../../src/reveal-hidden-files.js");
    await hideFile(context as never, PATH);
    expect(
      context.app.vault.adapter.reconcileDeletion,
    ).toHaveBeenCalledExactlyOnceWith(PATH, PATH);
  });

  it("showFile always reconciles the file back into the index", async () => {
    const context = makeContext(true, "synced");
    const { showFile } = await import("../../src/reveal-hidden-files.js");
    await showFile(context as never, PATH);
    expect(
      context.app.vault.adapter.reconcileFileInternal,
    ).toHaveBeenCalledExactlyOnceWith(PATH, PATH);
    expect(context.app.vault.adapter.reconcileDeletion).not.toHaveBeenCalled();
  });

  it("shows the notice only on the transition to active protection, not per blocked file", async () => {
    const { notice } = await import("@polyipseity/obsidian-plugin-library");
    const { reevaluateProtection } =
      await import("../../src/reveal-hidden-files.js");
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
      await import("../../src/reveal-hidden-files.js");
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
    // Notice fired on the inactive->active transition and again on the
    // active->inactive transition while Sync is active.
    expect(notice).toHaveBeenCalledTimes(2);
  });

  it("showFile drops a path from the pending set so it is not flushed", async () => {
    const { hideFile, showFile, reevaluateProtection } =
      await import("../../src/reveal-hidden-files.js");
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
    const { isSyncActive } = await import("../../src/utils.js");
    expect(isSyncActive(context as never)).toBe(true);
  });

  it("isSyncActive returns false when Sync is not active", async () => {
    const context = makeContext(true, "disconnected");
    const { isSyncActive } = await import("../../src/utils.js");
    expect(isSyncActive(context as never)).toBe(false);
  });

  it("isSyncActive fails closed (true) when the sync plugin is absent", async () => {
    const context = makeContext(true);
    const { isSyncActive } = await import("../../src/utils.js");
    expect(isSyncActive(context as never)).toBe(true);
  });

  it("isSyncActive fails closed (true) when the private API throws", async () => {
    const context = makeContext(true, "synced");
    const sync = context.app.internalPlugins.plugins.sync;
    if (sync) {
      sync.instance.getStatus = () => {
        throw new Error("private changed");
      };
    }
    const { isSyncActive } = await import("../../src/utils.js");
    expect(isSyncActive(context as never)).toBe(true);
  });

  it("isSyncDetected returns false when the sync plugin is absent", async () => {
    const context = makeContext(true);
    const { isSyncDetected } = await import("../../src/utils.js");
    expect(isSyncDetected(context as never)).toBe(false);
  });

  it("isSyncDetected returns false when the private API throws", async () => {
    const context = makeContext(true, "synced");
    const sync = context.app.internalPlugins.plugins.sync;
    if (sync) {
      sync.instance.getStatus = () => {
        throw new Error("private changed");
      };
    }
    const { isSyncDetected } = await import("../../src/utils.js");
    expect(isSyncDetected(context as never)).toBe(false);
  });

  it("isSyncDetected returns true when Sync is active", async () => {
    const context = makeContext(true, "synced");
    const { isSyncDetected } = await import("../../src/utils.js");
    expect(isSyncDetected(context as never)).toBe(true);
  });

  it("isSyncDetected returns false when Sync is not active", async () => {
    const context = makeContext(true, "disconnected");
    const { isSyncDetected } = await import("../../src/utils.js");
    expect(isSyncDetected(context as never)).toBe(false);
  });

  it("isProtectionActive is true only when protectSync is ON and Sync active", async () => {
    const { isProtectionActive } = await import("../../src/utils.js");
    expect(isProtectionActive(makeContext(true, "synced") as never)).toBe(true);
    expect(isProtectionActive(makeContext(false, "synced") as never)).toBe(
      false,
    );
    expect(isProtectionActive(makeContext(true, "disconnected") as never)).toBe(
      false,
    );
  });

  it("isProtectionActive fails closed (true) when Sync plugin is absent", async () => {
    const { isProtectionActive } = await import("../../src/utils.js");
    expect(isProtectionActive(makeContext(true) as never)).toBe(true);
  });

  it("warns on the active->inactive transition while Sync is active", async () => {
    const { notice } = await import("@polyipseity/obsidian-plugin-library");
    const { reevaluateProtection } =
      await import("../../src/reveal-hidden-files.js");
    // Establish active baseline (protection on + Sync active).
    reevaluateProtection(makeContext(true, "synced") as never);
    expect(notice).toHaveBeenCalledTimes(1);
    // Transition to inactive while Sync still active: inactive warning fires.
    reevaluateProtection(makeContext(false, "synced") as never);
    expect(notice).toHaveBeenCalledTimes(2);
    const lastArg = (notice as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    )?.[0] as (() => string) | undefined;
    expect(typeof lastArg).toBe("function");
    expect(lastArg?.()).toBe("notices.protect-sync-inactive");
  });

  it("does not warn on active->inactive transition when Sync is not active", async () => {
    const { notice } = await import("@polyipseity/obsidian-plugin-library");
    const { reevaluateProtection } =
      await import("../../src/reveal-hidden-files.js");
    reevaluateProtection(makeContext(true, "synced") as never);
    expect(notice).toHaveBeenCalledTimes(1);
    // Sync disconnected on deactivation: no second warning.
    reevaluateProtection(makeContext(false, "disconnected") as never);
    expect(notice).toHaveBeenCalledTimes(1);
  });
});
