export const usd = (value: number) => `$${value.toFixed(2)}`;
export const avgUsd = (value: number) =>
  value > 0 && value < 0.0001
    ? "<$0.0001"
    : `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
