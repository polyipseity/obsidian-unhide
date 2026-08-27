/**
 * Unit tests for `syncProtectionStatus` (GH#35 (obsidian-unhide)).
 *
 * The helper reports the user-facing Sync-protection status label. It must detect
 * Sync truthfully (`isSyncActive(context, false)`) and only consider the
 * `protectSync` setting when Sync is actually active, so turning protection off
 * while Sync is not enabled/active shows the idle "not detected" state instead of
 * the misleading "Sync active, protection OFF, deletions will sync" message.
 *
 * `revealPrivateFilter` is mocked to forward the private member into the callback,
 * so `isSyncActive` reads `app.internalPlugins.getPluginById("sync").instance.getStatus()`.
 */
import { describe, expect, it, vi } from "vitest";
import type { $SyncPluginInstance } from "../../src/@types/obsidian.js";

vi.mock("@polyipseity/obsidian-plugin-library", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@polyipseity/obsidian-plugin-library")
    >();
  return {
    ...actual,
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
  };
});

interface FakeSyncPlugin {
  instance: { getStatus: () => $SyncPluginInstance.Status };
}
interface FakeContext {
  app: {
    internalPlugins: {
      getPluginById: (id: string) => FakeSyncPlugin | null;
    };
  };
  settings: { value: { protectSync: boolean } };
}

function makeContext(
  protectSync: boolean,
  syncStatus: $SyncPluginInstance.Status | null,
): FakeContext {
  return {
    app: {
      internalPlugins: {
        getPluginById: (id: string): FakeSyncPlugin | null =>
          id === "sync" && syncStatus !== null
            ? { instance: { getStatus: () => syncStatus } }
            : null,
      },
    },
    settings: { value: { protectSync } },
  };
}

describe("src/utils.ts syncProtectionStatus (GH#35 (obsidian-unhide))", () => {
  it("reports protected when Sync is active and protection is on", async () => {
    const { syncProtectionStatus } = await import("../../src/utils.js");
    const status = syncProtectionStatus(makeContext(true, "synced") as never);
    expect(status).toEqual({
      key: "settings.protect-sync-status-protected",
      cls: "mod-success",
    });
  });

  it("reports unprotected when Sync is active and protection is off", async () => {
    const { syncProtectionStatus } = await import("../../src/utils.js");
    const status = syncProtectionStatus(makeContext(false, "synced") as never);
    expect(status).toEqual({
      key: "settings.protect-sync-status-unprotected",
      cls: "mod-warning",
    });
  });

  it("reports not-detected when Sync is disconnected and protection is off", async () => {
    const { syncProtectionStatus } = await import("../../src/utils.js");
    const status = syncProtectionStatus(
      makeContext(false, "disconnected") as never,
    );
    expect(status).toEqual({
      key: "settings.protect-sync-status-not-detected",
      cls: "mod-warning",
    });
  });

  it("reports not-detected when Sync is uninitialized and protection is on", async () => {
    const { syncProtectionStatus } = await import("../../src/utils.js");
    const status = syncProtectionStatus(
      makeContext(true, "uninitialized") as never,
    );
    expect(status).toEqual({
      key: "settings.protect-sync-status-not-detected",
      cls: "mod-warning",
    });
  });

  it("reports not-detected when the Sync plugin is absent and protection is off", async () => {
    const { syncProtectionStatus } = await import("../../src/utils.js");
    const status = syncProtectionStatus(makeContext(false, null) as never);
    expect(status).toEqual({
      key: "settings.protect-sync-status-not-detected",
      cls: "mod-warning",
    });
  });

  it("reports not-detected when the Sync plugin is absent and protection is on", async () => {
    const { syncProtectionStatus } = await import("../../src/utils.js");
    const status = syncProtectionStatus(makeContext(true, null) as never);
    expect(status).toEqual({
      key: "settings.protect-sync-status-not-detected",
      cls: "mod-warning",
    });
  });
});
