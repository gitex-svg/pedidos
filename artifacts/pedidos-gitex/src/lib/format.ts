function formatDecimal(value: string | number | undefined | null, digits: number) {
  if (value == null) return '';
  const raw = typeof value === 'number' ? value.toString() : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return '';
  const [, sign, rawWhole, rawFraction = ''] = match;
  const whole = rawWhole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = rawFraction.padEnd(digits, '0').slice(0, digits);
  return `${sign}${whole}${digits ? `,${fraction}` : ''}`;
}

export function formatMoney(value: string | number | undefined | null) {
  const formatted = formatDecimal(value, 2);
  return formatted ? `R$ ${formatted}` : '';
}

export function formatUnitPrice(value: string | number | undefined | null) {
  const formatted = formatDecimal(value, 6);
  return formatted ? `R$ ${formatted}` : '';
}

export function formatNumberBR(value: string | number | undefined | null, digits = 2) {
  return formatDecimal(value, digits);
}

export function normalizeDecimalString(val: string): string {
  if (!val) return "";
  let clean = val.trim();
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  return clean;
}

export function validateAndFormatQuantity(val: string): string | null {
  const norm = normalizeDecimalString(val);
  if (!/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,4})?$/.test(norm)) return null;
  if (BigInt(norm.replace('.', '')) === 0n) return null;
  return norm;
}

export function validateAndFormatUnitPrice(val: string): string | null {
  let norm = normalizeDecimalString(val);
  // Ensure it has at least one decimal place to match regex ^[0-9]{1,12}\.[0-9]{1,6}$
  if (norm && !norm.includes('.')) {
    norm += '.0';
  }
  if (!/^[0-9]{1,12}\.[0-9]{1,6}$/.test(norm)) return null;
  if (BigInt(norm.replace('.', '')) === 0n) return null;
  return norm;
}

export function subtractMoney(left: string, right: string): string {
  const toCents = (value: string) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
  };
  const cents = toCents(left) - toCents(right);
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
