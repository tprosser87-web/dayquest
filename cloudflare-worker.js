// Cloudflare Worker calendar proxy for DayQuest.
// Deploy with: npx wrangler login && npx wrangler deploy
// Then paste the worker URL (e.g. https://dayquest-ics.your-account.workers.dev) into DayQuest Settings, or set PROXY_BASE in config.js.
const ALLOWED = [/^calendar\.google\.com$/i, /^outlook\.office365\.com$/i, /^outlook\.office\.com$/i, /^outlook\.live\.com$/i, /^p\d+-caldav\.icloud\.com$/i];
export default {
  async fetch(request) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    let target;
    try { target = new URL((new URL(request.url).searchParams.get('url') || '').replace(/^webcal:\/\//i, 'https://')); } catch (e) { return new Response('Invalid URL', { status: 400, headers: cors }); }
    if (target.protocol !== 'https:' || !ALLOWED.some((r) => r.test(target.hostname))) return new Response('Host not allowed', { status: 400, headers: cors });
    const r = await fetch(target.toString(), { headers: { Accept: 'text/calendar,*/*' } });
    if (!r.ok) return new Response('Calendar server answered ' + r.status, { status: 502, headers: cors });
    return new Response(await r.text(), { headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8' } });
  }
};
