export type InstallmentSimulation = {
  baseAmount: number;
  feeAmount: number;
  totalWithFee: number;
  installmentAmount: number;
  installments: number;
  feePercent: number;
  netAmount: number;
};

export type FeePayer = "customer" | "seller";

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function simulateInstallments(
  baseAmount: number,
  feePercent: number,
  installments: number,
  feePayer: FeePayer = "customer",
): InstallmentSimulation {
  const safeBase = Number.isFinite(baseAmount) && baseAmount > 0 ? baseAmount : 0;
  const safeFee = Number.isFinite(feePercent) ? Math.min(Math.max(feePercent, 0), 99.99) : 0;
  const safeInstallments = Math.min(Math.max(Math.trunc(installments) || 1, 1), 12);
  const customerPays = feePayer === "customer";
  const totalWithFee = customerPays && safeFee > 0
    ? roundMoney(safeBase / (1 - safeFee / 100))
    : roundMoney(safeBase);
  const feeAmount = customerPays
    ? roundMoney(totalWithFee - safeBase)
    : roundMoney(totalWithFee * (safeFee / 100));

  return {
    baseAmount: roundMoney(safeBase),
    feeAmount,
    totalWithFee,
    installmentAmount: roundMoney(totalWithFee / safeInstallments),
    installments: safeInstallments,
    feePercent: safeFee,
    netAmount: customerPays ? roundMoney(safeBase) : roundMoney(totalWithFee - feeAmount),
  };
}
