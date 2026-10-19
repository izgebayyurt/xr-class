// Study logging (opt-in): nothing is sent unless a participant code has been entered on brief.html.
// Events go to the class short-link worker's /log endpoint with the kit version. Fire-and-forget; never blocks the page.
window.XRLOG = (() => {
  const get = () => { try { return localStorage.getItem('xr-pid') || ''; } catch { return ''; } };
  const set = v => { try { v ? localStorage.setItem('xr-pid', v) : localStorage.removeItem('xr-pid'); } catch {} };
  const send = (event, data) => {
    const pid = get(); const base = window.SHORTLINK_URL;
    if (!pid || !base) return false;
    try { fetch(base + '/log', { method: 'POST', body: JSON.stringify({ pid, event, data: { ...data, kit: window.KIT_VERSION || null, page: location.pathname.split('/').pop() } }), keepalive: true }).catch(() => {}); } catch {}
    return true;
  };
  return { get pid(){ return get(); }, set pid(v){ set(v); }, send, get enabled(){ return !!(get() && window.SHORTLINK_URL); } };
})();
