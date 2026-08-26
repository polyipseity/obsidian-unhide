import { describe, it, expect } from "vitest";
import { PluginLocales } from "../../assets/locales.js";

describe("PluginLocales", () => {
  it("exports defaults from library and namespaces", () => {
    expect(PluginLocales.DEFAULT_LANGUAGE).toBe("en");
    expect(PluginLocales.DEFAULT_NAMESPACE).toBe("translation");

    // NAMESPACES should include the three expected namespaces
    const namespaces = Array.from(PluginLocales.NAMESPACES);
    expect(namespaces).toEqual(
      expect.arrayContaining(["translation", "language", "asset"]),
    );
  });

  it("provides en resources (translation, asset, language)", async () => {
    const enRes = PluginLocales.RESOURCES[PluginLocales.DEFAULT_LANGUAGE];

    const translation = await enRes[PluginLocales.DEFAULT_NAMESPACE]();
    // The default translation here comes from the raw assets; assert it contains the expected tokens
    expect(translation.name).toBe("Unhide");

    const asset = await enRes.asset();
    expect(asset.settings.documentations["readme-icon"]).toBe(
      "$t(asset:generic.documentations.readme-icon)",
    );

    const language = await enRes.language();
    expect(language.en).toBe("English");
  });

  it("lists languages and includes expected entries", () => {
    const langs = Array.from(PluginLocales.LANGUAGES);
    expect(langs).toEqual(expect.arrayContaining(["en", "pt", "pt-BR"]));
  });

  it("loads translation resources for all declared languages", async () => {
    const languages = Array.from(PluginLocales.LANGUAGES);

    // Prepare loaders: each language should expose a default namespace loader
    const loaders = languages.map((lang) => {
      const res = PluginLocales.RESOURCES[lang];
      expect(res).toBeDefined();
      const loader = res[PluginLocales.DEFAULT_NAMESPACE];
      expect(typeof loader).toBe("function");
      return loader();
    });

    const results = await Promise.all(loaders);
    for (const r of results) {
      const record = r;
      expect(typeof record).toBe("object");
      expect(record).not.toBeNull();
    }

    // Sanity checks for special keys
    const ptBr = PluginLocales.RESOURCES["pt-BR"].translation;
    expect(typeof ptBr).toBe("function");
    const ptBrRes = await ptBr();
    expect(typeof ptBrRes).toBe("object");

    const zhHans = PluginLocales.RESOURCES["zh-Hans"].translation;
    expect(typeof zhHans).toBe("function");
    const zhHansRes = await zhHans();
    expect(typeof zhHansRes).toBe("object");
  });

  it("declares the GH#35 protect-sync keys in en translation", async () => {
    const enRes = PluginLocales.RESOURCES[PluginLocales.DEFAULT_LANGUAGE];
    const translation = await enRes[PluginLocales.DEFAULT_NAMESPACE]();
    const settings = translation.settings as Record<string, unknown>;
    const notices = translation.notices as Record<string, unknown>;

    for (const key of [
      "protect-sync",
      "protect-sync-description",
      "protect-sync-status-protected",
      "protect-sync-status-unprotected",
      "protect-sync-status-not-detected",
    ] as const) {
      expect(typeof settings[key]).toBe("string");
      expect((settings[key] as string).length).toBeGreaterThan(0);
    }

    expect(typeof notices["protect-sync-active"]).toBe("string");
    expect((notices["protect-sync-active"] as string).length).toBeGreaterThan(
      0,
    );

    expect(typeof notices["protect-sync-inactive"]).toBe("string");
    expect((notices["protect-sync-inactive"] as string).length).toBeGreaterThan(
      0,
    );
  });
});
