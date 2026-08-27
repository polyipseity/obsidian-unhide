/**
 * Unit tests for the Sync-safe guard (GH#35 (obsidian-unhide)).
 *
 * `hideFile`/`showFile`/`isSyncActive`/`reevaluateProtection` are driven through a fake `context`
 * shaped like `UnhidePlugin`: `app.internalPlugins.getPluginById("sync")?.instance.getStatus()` reports
 * the Sync connection status, and `settings.value.protectSync` toggles the guard. The adapter is a
 * fake whose `reconcileDeletion` is a spy and `getRealPath` is identity. `revealPrivateFilter`/
 * `revealPrivateAsyncFilter` are mocked (see top of file) to forward the private member into the
 * callback, so `hideFile` reaches `adapter.reconcileDeletion`. `notice` is mocked so we can assert
 * the transition warning.
 *
 * `protectedHiddenPaths` and `lastProtectionActive` are module-scope state shared across calls and
 * tests. Because `lastProtectionActive` is module-scope, each test resets it by re-importing the
 * module under test with `vi.resetModules()` and re-importing `notice` from the mocked library.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { $SyncPluginInstance } from "../../src/@types/obsidian.js";

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

vi.mock("monkey-around", () => ({
  around: vi.fn(() => vi.fn()),
}));

describe("src/reveal-hidden-files.ts Sync-safe guard (GH#35 (obsidian-unhide))", () => {
  const PATH = ".hidden/file.md";
  const PATH2 = ".hidden/other.md";

  interface FakeSyncPlugin {
    instance: {
      getStatus: () => $SyncPluginInstance.Status;
      on: ReturnType<typeof vi.fn>;
      off: ReturnType<typeof vi.fn>;
    };
  }
  interface FakeContext {
    app: {
      internalPlugins: {
        getPluginById: (id: string) => FakeSyncPlugin | null;
      };
      vault: { adapter: FakeAdapter };
      workspace: { onLayoutReady: (cb: () => void) => void };
    };
    settings: {
      value: { protectSync: boolean; errorNoticeTimeout: number };
      onMutate: (
        accessor: (setting: { protectSync: boolean }) => unknown,
        cb: () => unknown,
      ) => unknown;
    };
    language: { value: { t: (key: string) => string } };
    register: (cb: () => void) => void;
    registered: Array<() => void>;
  }
  interface FakeAdapter {
    reconcileDeletion: ReturnType<typeof vi.fn>;
    reconcileFileInternal: ReturnType<typeof vi.fn>;
    getRealPath: (path: string) => string;
  }

  function makeContext(
    protectSync: boolean,
    syncStatus?: $SyncPluginInstance.Status,
  ): FakeContext {
    const adapter: FakeAdapter = {
      reconcileDeletion: vi.fn(),
      reconcileFileInternal: vi.fn(),
      getRealPath: (path: string): string => path,
    };
    const sync: FakeSyncPlugin | null =
      syncStatus === undefined
        ? null
        : {
            instance: {
              getStatus: () => syncStatus,
              on: vi.fn(),
              off: vi.fn(),
            },
          };
    const registered: Array<() => void> = [];
    return {
      app: {
        internalPlugins: {
          getPluginById: (id: string): FakeSyncPlugin | null =>
            id === "sync" ? sync : null,
        },
        vault: { adapter },
        workspace: { onLayoutReady: () => undefined },
      },
      settings: {
        value: { protectSync, errorNoticeTimeout: 0 },
        onMutate: () => () => undefined,
      },
      language: { value: { t: (key: string): string => key } },
      register: (cb: () => void): void => {
        registered.push(cb);
      },
      registered,
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
    const sync = context.app.internalPlugins.getPluginById("sync");
    if (sync) {
      sync.instance.getStatus = () => {
        throw new Error("private changed");
      };
    }
    const { isSyncActive } = await import("../../src/utils.js");
    expect(isSyncActive(context as never)).toBe(true);
  });

  it("isSyncActive fails open (false) when Sync plugin is absent and fallback is false", async () => {
    const context = makeContext(true);
    const { isSyncActive } = await import("../../src/utils.js");
    expect(isSyncActive(context as never, false)).toBe(false);
  });

  it("isSyncActive fails closed (true) when Sync plugin is absent and fallback is true", async () => {
    const context = makeContext(true);
    const { isSyncActive } = await import("../../src/utils.js");
    expect(isSyncActive(context as never, true)).toBe(true);
  });

  it("isSyncActive fails open (false) when the private API throws and fallback is false", async () => {
    const context = makeContext(true, "synced");
    const sync = context.app.internalPlugins.getPluginById("sync");
    if (sync) {
      sync.instance.getStatus = () => {
        throw new Error("private changed");
      };
    }
    const { isSyncActive } = await import("../../src/utils.js");
    expect(isSyncActive(context as never, false)).toBe(false);
  });

  it("isSyncProtectionActive is true only when protectSync is ON and Sync active", async () => {
    const { isSyncProtectionActive } = await import("../../src/utils.js");
    expect(isSyncProtectionActive(makeContext(true, "synced") as never)).toBe(
      true,
    );
    expect(isSyncProtectionActive(makeContext(false, "synced") as never)).toBe(
      false,
    );
    expect(
      isSyncProtectionActive(makeContext(true, "disconnected") as never),
    ).toBe(false);
  });

  it("isSyncProtectionActive fails closed (true) when Sync plugin is absent", async () => {
    const { isSyncProtectionActive } = await import("../../src/utils.js");
    expect(isSyncProtectionActive(makeContext(true) as never)).toBe(true);
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

  it("subscribes to Sync status-change and re-evaluates protection on fire", async () => {
    const { loadRevealHiddenFiles } =
      await import("../../src/reveal-hidden-files.js");
    const context = makeContext(true, "synced");
    const sync = context.app.internalPlugins.getPluginById("sync");
    expect(sync).not.toBeNull();
    if (sync === null) {
      throw new Error("expected sync plugin to be present");
    }
    const on = sync.instance.on;
    const off = sync.instance.off;
    // `loadRevealHiddenFiles` -> `patchVault` wires the status-change handler.
    loadRevealHiddenFiles(
      context as never,
      {
        test: () => true,
        onChanged: {
          listen: () => {
            return (): void => undefined;
          },
          emit: async (): Promise<void> => {
            return undefined;
          },
        },
      } as never,
    );
    expect(on).toHaveBeenCalledExactlyOnceWith(
      "status-change",
      expect.any(Function),
    );
    // Fire the handler: protection re-evaluation runs (no throw).
    const firstCall = on.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("expected status-change handler to be registered");
    }
    const handler = firstCall[1] as () => void;
    expect(() => {
      handler();
    }).not.toThrow();
    // Unregistering the plugin context detaches the handler.
    context.registered.forEach((cb) => {
      cb();
    });
    expect(off).toHaveBeenCalledExactlyOnceWith("status-change", handler);
  });
});
