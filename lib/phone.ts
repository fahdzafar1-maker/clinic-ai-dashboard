// Keep in sync with public.mask_phone() in supabase/migrations/002_multi_clinic.sql —
// the database masks on insert too, this is the display-side safety net.

/** Calling codes, longest first so "971" wins over "97…" style prefixes. */
const COUNTRY_CODES = ['212', '213', '216', '218', '234', '254', '255', '256', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '380', '381', '382', '385', '386', '387', '389', '420', '421', '880', '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996', '998', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '1', '7'];

/**
 * "+971501234567" → "+971 50 *** 4567". Already-masked values pass through.
 * `localCode` is the clinic's own calling code, used for local numbers like 0501234567.
 */
export function maskPhone(raw: string | null | undefined, localCode = '971'): string {
  if (!raw) return '—';
  if (raw.includes('*')) return raw;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = localCode + digits.slice(1);
  if (digits.length < 7) return '***';
  const cc = COUNTRY_CODES.find((c) => digits.startsWith(c)) ?? digits.slice(0, 3);
  const rest = digits.slice(cc.length);
  return `+${cc} ${rest.slice(0, 2)} *** ${rest.slice(-4)}`;
}
