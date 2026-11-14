const MAX_PAISE = 10_000_000_000;

/**
 * Rupee text to integer paise, by string math (no float multiplication).
 * Null when empty, negative, malformed or above the cap; 0 for zero.
 */
export function parseRupeesToPaise(text: string): number | null {
  const cleaned = text.replace(/[₹\s]/g, '');
  const [whole = '', frac] = cleaned.split('.');
  // Commas only in valid Indian (1,00,000) or Western (100,000) grouping.
  if (whole.includes(',') && !/^(\d{1,2}(,\d{2})*,\d{3}|\d{1,3}(,\d{3})+)$/.test(whole)) {
    return null;
  }
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(whole.replace(/,/g, '') + (frac === undefined ? '' : '.' + frac));

  if (!match) {
    return null;
  }

  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return paise > MAX_PAISE ? null : paise;
}

function groupIndian(whole: number): string {
  const digits = String(whole);
  if (digits.length <= 3) {
    return digits;
  }
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${head},${digits.slice(-3)}`;
}

/** `₹1,00,000`, `₹120.50`, negatives as `−₹500` (U+2212). */
export function formatRupees(paise: number): string {
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  const body = `₹${groupIndian(whole)}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
  return paise < 0 ? `−${body}` : body;
}
