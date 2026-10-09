export const usd = (value: number) => `$${value.toFixed(2)}`;
export const avgUsd = (value: number) =>
  `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
