// Keep in sync with public.mask_phone() in supabase/schema.sql — the database
// masks on insert too, this is the display-side safety net.

/** Assumed for local numbers like 0501234567. Change together with the SQL version. */
const LOCAL_COUNTRY_CODE = '971';
const COUNTRY_CODES = ['971', '966', '974', '973', '968', '965', '962', '961', '92', '91', '90', '49', '44', '41', '39', '34', '33', '31', '20', '7', '1'];

/** "+971501234567" → "+971 50 *** 4567". Already-masked values pass through. */
export function maskPhone(raw: string | null | undefined): string {
  if (!raw) return '—';
  if (raw.includes('*')) return raw;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = LOCAL_COUNTRY_CODE + digits.slice(1); // local format, e.g. 050…
  if (digits.length < 7) return '***';
  const cc = COUNTRY_CODES.find((c) => digits.startsWith(c)) ?? digits.slice(0, 3);
  const rest = digits.slice(cc.length);
  return `+${cc} ${rest.slice(0, 2)} *** ${rest.slice(-4)}`;
}
