import { describe, expect, it } from "vitest";
import { simulateInstallments } from "../installment-simulator";

describe("simulateInstallments", () => {
  it("repassa a taxa para preservar o valor líquido", () => {
    expect(simulateInstallments(1000, 5, 10)).toEqual({
      baseAmount: 1000,
      feeAmount: 52.63,
      totalWithFee: 1052.63,
      installmentAmount: 105.26,
      installments: 10,
      feePercent: 5,
      netAmount: 1000,
    });
  });

  it("desconta a taxa do líquido quando o vendedor assume", () => {
    expect(simulateInstallments(1000, 5, 10, "seller")).toEqual({
      baseAmount: 1000,
      feeAmount: 50,
      totalWithFee: 1000,
      installmentAmount: 100,
      installments: 10,
      feePercent: 5,
      netAmount: 950,
    });
  });

  it("limita o parcelamento entre 1x e 12x", () => {
    expect(simulateInstallments(120, 0, 20).installments).toBe(12);
    expect(simulateInstallments(120, 0, 0).installments).toBe(1);
  });

  it("não produz valores negativos com entradas inválidas", () => {
    expect(simulateInstallments(-100, -5, 3).totalWithFee).toBe(0);
  });
});
