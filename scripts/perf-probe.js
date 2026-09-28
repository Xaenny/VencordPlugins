/*
 * Paste this whole file into Discord's console (Ctrl+Shift+I > Console) to find out whether these
 * plugins are what makes the client feel slow.
 *
 * It measures style recalculation with the plugins' stylesheets on and off, then asks you to hover
 * around for five seconds with them on and five with them off, and prints the frame times for both.
 * Everything is put back the way it was at the end; nothing is saved or sent anywhere.
 *
 * If the two passes look the same, the plugins' CSS is not the problem and it is worth looking at
 * Discord itself - having DevTools open is itself a large cost, as is a dev build.
 */

(async () => {
  const q = "vencord-root style, vencord-styles style, vencord-managed-styles style, vencord-user-styles style";
  const sheets = [...document.querySelectorAll(q)].map(n => n.sheet).filter(Boolean);
  console.log(`%cVencord stylesheets found: ${sheets.length}`, "color:#5865f2;font-weight:bold");

  const setDisabled = v => sheets.forEach(s => { try { s.disabled = v; } catch {} });

  // 1. Style recalculation cost, no interaction needed
  const probes = [...document.querySelectorAll("div")].slice(0, 300);
  const pass = () => { let s = 0; for (const el of probes) { el.classList.add("vc-probe"); s += el.offsetHeight; el.classList.remove("vc-probe"); s += el.offsetHeight; } return s; };
  const recalc = () => { for (let i = 0; i < 3; i++) pass(); const r = []; for (let n = 0; n < 7; n++) { const t = performance.now(); pass(); r.push(performance.now() - t); } r.sort((a, b) => a - b); return +r[3].toFixed(2); };

  const recalcOn = recalc();
  setDisabled(true);
  const recalcOff = recalc();
  setDisabled(false);

  // 2. Frame times while you hover
  const frames = async (label, secs = 5) => {
    console.log(`%c${label} - hover server icons / open a right-click submenu for ${secs}s`, "color:#f0b232;font-weight:bold;font-size:14px");
    const out = []; let last = performance.now(), stop = false;
    setTimeout(() => stop = true, secs * 1000);
    await new Promise(res => { const tick = now => { out.push(now - last); last = now; if (stop) return res(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    out.shift(); out.sort((a, b) => a - b);
    return { pass: label, frames: out.length, medianMs: +out[out.length >> 1].toFixed(1), p95Ms: +out[Math.floor(out.length * .95)].toFixed(1), over50ms: out.filter(f => f > 50).length };
  };

  const a = await frames("1/2  plugin styles ON");
  setDisabled(true);
  const b = await frames("2/2  plugin styles OFF");
  setDisabled(false);

  console.table([a, b]);
  console.table([{ "style recalc, plugin CSS on (ms)": recalcOn, "off (ms)": recalcOff }]);
  console.log("%cDone - plugin styles re-enabled. Paste both tables back.", "color:#3ba55d;font-weight:bold");
})();
