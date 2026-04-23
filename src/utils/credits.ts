export const formatCreditAmount = (value: unknown): string => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  if (Math.abs(num - Math.trunc(num)) < 0.000001) return String(Math.trunc(num));
  return num.toFixed(1);
};

export const formatSignedCreditAmount = (value: unknown): string => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  const formatted = formatCreditAmount(Math.abs(num));
  if (num > 0) return `+${formatted}`;
  if (num < 0) return `-${formatted}`;
  return formatted;
};

export const roundCreditTenths = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
};
