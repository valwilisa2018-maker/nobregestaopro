import { describe, expect, it } from "vitest";
import {
  firstAllowedModulePath,
  MENU_MODULES,
  moduleForPath,
  normalizePermissions,
} from "../access-control";

describe("access-control", () => {
  it("normaliza permissões desconhecidas e preenche todos os módulos", () => {
    const permissions = normalizePermissions({ sales: { view: true }, unknown: { delete: true } });
    expect(Object.keys(permissions)).toHaveLength(MENU_MODULES.length);
    expect(permissions.sales).toEqual({ view: true, create: false, edit: false, delete: false });
    expect(permissions.unknown).toBeUndefined();
  });

  it("resolve rotas filhas para o módulo mais específico", () => {
    expect(moduleForPath("/pastas-arquivos/abc")?.key).toBe("files");
    expect(moduleForPath("/operacao-meta/relatorios")?.key).toBe("goals");
    expect(moduleForPath("/medidor-roteiro")?.key).toBe("script_timer");
    expect(moduleForPath("/transcricao")?.key).toBe("transcription");
    expect(moduleForPath("/rota-publica")).toBeUndefined();
  });

  it("mantém os módulos novos disponíveis no editor de permissões", () => {
    const permissions = normalizePermissions({});
    expect(permissions.script_timer).toEqual({
      view: false,
      create: false,
      edit: false,
      delete: false,
    });
    expect(permissions.transcription).toEqual({
      view: false,
      create: false,
      edit: false,
      delete: false,
    });
  });

  it("encontra o primeiro módulo permitido para o redirecionamento pós-login", () => {
    expect(firstAllowedModulePath((key) => key === "customers")).toBe("/customers");
    expect(firstAllowedModulePath(() => false)).toBeNull();
  });
});
