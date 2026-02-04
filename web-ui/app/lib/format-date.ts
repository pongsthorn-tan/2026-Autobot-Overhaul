const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Format date as dd/MMM/yyyy HH:mm — e.g. 04/Feb/2026 18:30 */
export function formatDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = MONTHS[d.getMonth()];
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mmm}/${yyyy} ${hh}:${mm}`;
}

/** Format time only as HH:mm — e.g. 18:30 */
export function formatTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Format short date as dd/MMM HH:mm — e.g. 04/Feb 18:30 */
export function formatDateShort(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = MONTHS[d.getMonth()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mmm} ${hh}:${mm}`;
}
