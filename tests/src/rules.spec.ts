/**
 * Unit tests for `src/rules.ts` — assert `loadRules` returns a `ShowingRules`
 * instance wired to the plugin context.
 *
 * `ShowingRules` extends `SettingRules` and, in its constructor, registers
 * `settings.onMutate` listeners and patches `Vault.setConfigDir` via
 * `revealPrivateFilter`. The library is mocked so `revealPrivateFilter` forwards
 * the private member (`vault`) into the callback, letting the constructor run
 * against a fake `UnhidePlugin` context without a real Obsidian app.
 */
import { describe, expect, it, vi } from "vitest";

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

describe("src/rules.ts", () => {
  interface FakeContext {
    app: { vault: { configDir: string } };
    settings: {
      value: {
        showingRules: readonly string[];
        showHiddenFiles: boolean;
        showConfigurationFolder: boolean;
      };
      onMutate: (accessor: unknown, cb: unknown) => unknown;
    };
    register: (x: unknown) => void;
  }

  function makeContext(): FakeContext {
    return {
      app: { vault: { configDir: ".obsidian" } },
      settings: {
        value: {
          showingRules: ["+/", "-/\\.git(?:\\/|$)/u"],
          showHiddenFiles: true,
          showConfigurationFolder: true,
        },
        onMutate: vi.fn(() => ({})),
      },
      register: vi.fn(),
    };
  }

  it("loadRules returns a ShowingRules instance wired to the context", async () => {
    const context = makeContext();
    const { loadRules, ShowingRules } = await import("../../src/rules.js");
    const rules = loadRules(context as never);
    expect(rules).toBeInstanceOf(ShowingRules);
    expect(typeof rules.test).toBe("function");
    expect(rules.onChanged).toBeDefined();
    // Constructor registers the config-dir patch and two setting listeners.
    expect(context.register).toHaveBeenCalled();
  });

  it("ShowingRules.test honors the config-dir visibility rule", async () => {
    const context = makeContext();
    const { loadRules } = await import("../../src/rules.js");
    const rules = loadRules(context as never);
    // `.obsidian` matches the config-dir rule and is shown when
    // `showConfigurationFolder` is true.
    expect(rules.test(".obsidian")).toBe(true);
    expect(rules.test(".hidden/file.md")).toBe(true);
  });
});
