const numberFormatter = new Intl.NumberFormat("en-SG", {
  maximumFractionDigits: 0,
});

/** Always shows the Singapore-dollar context; Intl en-SG alone formats SGD as "$". */
export function formatSgd(amount: number): string {
  return `S$${numberFormatter.format(amount)}`;
}

export function formatScore(score: number): string {
  return `${Math.round(score * 100)}/100`;
}
