/* DayQuest site config.
   PROXY_BASE: Cloudflare Worker URL for calendar sync, with no trailing path.
   Example: 'https://dayquest-ics.your-account.workers.dev'
   Leave blank until the worker is deployed. A value in Settings overrides this. */
window.DAYQUEST_CONFIG = {
  BASE_PATH: '/dayquest/',
  PROXY_BASE: 'https://dayquest-ics.tprosser87.workers.dev'
};
