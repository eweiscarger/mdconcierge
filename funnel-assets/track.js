/* MDconcierge funnel tracker (client-agnostic, reusable).
   Reads the per-physician token from ?p= and reports engagement to the
   funnel-track edge function. No PII is collected on the page: the token
   is the only key, resolved server-side to a CRM record.
   Signals: open, scroll depth, time on page, return visit, CTA hit. */
(function () {
  var ENDPOINT = "https://pjdbzrzadlldojuvdrfj.supabase.co/functions/v1/funnel-track";
  var params = new URLSearchParams(window.location.search);
  var token = params.get("p") || "";
  var page = (document.body && document.body.getAttribute("data-funnel-page")) || "unknown";

  function send(payload, useBeacon) {
    if (!token) return; // nothing to attribute without a token
    payload.token = token;
    payload.page = page;
    var url = ENDPOINT;
    try {
      var body = JSON.stringify(payload);
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
          mode: "cors"
        }).catch(function () {});
      }
    } catch (e) { /* never let tracking break the page */ }
  }

  // Return-visit detection (per token, per browser).
  var isReturn = false;
  try {
    var k = "mdc_seen_" + token;
    isReturn = !!localStorage.getItem(k);
    localStorage.setItem(k, "1");
  } catch (e) {}

  // Carry the token onto internal funnel links so the next page keeps tracking.
  // Any <a data-keep href="/book.html"> gets ?p=TOKEN appended.
  if (token) {
    var links = document.querySelectorAll("a[data-keep]");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute("href") || "";
      if (href && href.indexOf("mailto:") !== 0 && href.indexOf("p=") === -1) {
        a.setAttribute("href", href + (href.indexOf("?") === -1 ? "?" : "&") + "p=" + encodeURIComponent(token));
      }
    }
  }

  // OPEN (fires once on load).
  send({ event: "open", ret: isReturn ? 1 : 0 }, false);

  // SCROLL depth (max %, reported at the end).
  var maxScroll = 0;
  function onScroll() {
    var h = document.documentElement;
    var scrollable = (h.scrollHeight - h.clientHeight);
    var pct = scrollable > 0 ? Math.round((h.scrollTop / scrollable) * 100) : 100;
    if (pct > maxScroll) maxScroll = Math.min(100, pct);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // TIME on page (active accumulation).
  var start = null, elapsed = 0;
  function resume() { if (start === null) start = performance.now(); }
  function pause() { if (start !== null) { elapsed += (performance.now() - start); start = null; } }
  resume();

  // CTA clicks: any element with data-cta reports which door they chose.
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-cta]") : null;
    if (el) send({ event: "cta", cta: el.getAttribute("data-cta") }, true);
  }, true);

  // Flush engagement on the way out (beacon survives unload).
  function flush() {
    pause();
    send({ event: "engage", scroll: maxScroll, seconds: Math.round(elapsed / 1000), ret: isReturn ? 1 : 0 }, true);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { flush(); }
    else { resume(); }
  });
  window.addEventListener("pagehide", flush);
})();
