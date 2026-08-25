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
 * Unit tests for the Sync-safe guard (issue #35).
 *
 * `hideFile`/`showFile`/`isSyncEnabled` are driven through a fake `context` shaped like
 * `UnhidePlugin`: `app.internalPlugins.plugins.sync.enabled` controls Sync detection, and
 * `settings.value.syncSafeHide` toggles the guard. The adapter is a fake whose `reconcileDeletion`
 * is a spy and `getRealPath` is identity. `revealPrivateFilter`/`revealPrivateAsyncFilter` are
 * mocked (see top of file) to forward the private member into the callback, so `hideFile` reaches
 * `adapter.reconcileDeletion` and `isSyncEnabled` reads the sync plugin state.
 */
describe("src/show-hidden-files.ts Sync-safe guard (issue #35)", () => {
  const PATH = ".hidden/file.md";

  interface FakeContext {
    app: {
      internalPlugins: {
        plugins: { sync?: { enabled: boolean } };
      };
      vault: { adapter: FakeAdapter };
    };
    settings: { value: { syncSafeHide: boolean } };
    register: () => void;
  }
  interface FakeAdapter {
    reconcileDeletion: ReturnType<typeof vi.fn>;
    reconcileFileInternal: ReturnType<typeof vi.fn>;
    getRealPath: (path: string) => string;
  }

  function makeContext(
    syncSafeHide: boolean,
    syncEnabled?: boolean,
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
            ...(syncEnabled === undefined
              ? {}
              : { sync: { enabled: syncEnabled } }),
          },
        },
        vault: { adapter },
      },
      settings: { value: { syncSafeHide } },
      register: vi.fn(),
    };
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("hideFile calls reconcileDeletion when syncSafeHide is OFF", async () => {
    const context = makeContext(false, true);
    const { hideFile } = await import("../../src/show-hidden-files.js");
    await hideFile(context as never, PATH);
    expect(
      context.app.vault.adapter.reconcileDeletion,
    ).toHaveBeenCalledExactlyOnceWith(PATH, PATH);
  });

  it("hideFile does NOT call reconcileDeletion when ON and Sync enabled", async () => {
    const context = makeContext(true, true);
    const { hideFile } = await import("../../src/show-hidden-files.js");
    await hideFile(context as never, PATH);
    expect(context.app.vault.adapter.reconcileDeletion).not.toHaveBeenCalled();
  });

  it("hideFile DOES call reconcileDeletion when ON but Sync not detected", async () => {
    const context = makeContext(true, false);
    const { hideFile } = await import("../../src/show-hidden-files.js");
    await hideFile(context as never, PATH);
    expect(
      context.app.vault.adapter.reconcileDeletion,
    ).toHaveBeenCalledExactlyOnceWith(PATH, PATH);
  });

  it("showFile always reconciles the file back into the index", async () => {
    const context = makeContext(true, true);
    const { showFile } = await import("../../src/show-hidden-files.js");
    await showFile(context as never, PATH);
    expect(
      context.app.vault.adapter.reconcileFileInternal,
    ).toHaveBeenCalledExactlyOnceWith(PATH, PATH);
    expect(context.app.vault.adapter.reconcileDeletion).not.toHaveBeenCalled();
  });

  it("isSyncEnabled returns true when the sync plugin is enabled", async () => {
    const context = makeContext(true, true);
    const { isSyncEnabled } = await import("../../src/show-hidden-files.js");
    expect(isSyncEnabled(context as never)).toBe(true);
  });

  it("isSyncEnabled returns false when the sync plugin is disabled", async () => {
    const context = makeContext(true, false);
    const { isSyncEnabled } = await import("../../src/show-hidden-files.js");
    expect(isSyncEnabled(context as never)).toBe(false);
  });

  it("isSyncEnabled falls back to false when the sync plugin is absent", async () => {
    const context = makeContext(true);
    const { isSyncEnabled } = await import("../../src/show-hidden-files.js");
    expect(isSyncEnabled(context as never)).toBe(false);
  });
});
