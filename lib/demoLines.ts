/**
 * Our dedicated AI demo lines: Vapi numbers whose Server URL points to the DEMO-02 workflow
 * and that have no assistant attached. Each prospect demo can borrow one line; when the demo
 * ends the line is free for the next prospect.
 *
 * Add new lines here, or set NEXT_PUBLIC_DEMO_LINES (comma-separated) in Vercel.
 */
export const DEMO_LINES: string[] = (process.env.NEXT_PUBLIC_DEMO_LINES || '+1 757 760 9040')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean);

export const phoneDigits = (n: string | null | undefined) => (n ?? '').replace(/\D/g, '');
