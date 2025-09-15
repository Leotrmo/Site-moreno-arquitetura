/* =======================
   PRELOADER (fade-in)
   ======================= */
(function () {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // cria overlay só se não existir
  function injectPreloader() {
    if (document.querySelector(".preloader")) return;
    const el = document.createElement("div");
    el.className = "preloader";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }

  // ativa classe que evita transições iniciais
  document.documentElement.classList.add("preload");
  // injeta o overlay assim que possível
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectPreloader, { once: true });
  } else {
    injectPreloader();
  }

  // remove preloader no load (ou imediatamente se usuário prefere menos movimento)
  function clearPreloader() {
    const overlay = document.querySelector(".preloader");
    if (!overlay) return;

    if (prefersReduced) {
      overlay.remove();
      document.documentElement.classList.remove("preload");
      document.body.classList.add("is-loaded");
      return;
    }

    // adiciona classe para animar fade-out
    overlay.classList.add("preloader--hide");
    overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
    document.documentElement.classList.remove("preload");
    document.body.classList.add("is-loaded");
  }

  // segurança: se não disparar 'load', removemos após 2.5s
  const failSafe = setTimeout(clearPreloader, 2500);

  window.addEventListener("load", () => {
    clearTimeout(failSafe);
    clearPreloader();
  });
})();

/* =======================
   REVEAL ON SCROLL
   ======================= */
document.addEventListener("DOMContentLoaded", () => {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reveals = document.querySelectorAll(".reveal");

  if (prefersReduced || !("IntersectionObserver" in window)) {
    reveals.forEach(el => el.classList.add("in"));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target); // anima só uma vez
      }
    });
  }, { threshold: 0.15 });

  reveals.forEach(el => io.observe(el));
});

/* =======================
   MENU ATIVO
   ======================= */
(function () {
  const navLinks = document.querySelectorAll("header nav a");
  // pega o último segmento (arquivo) da URL
  const current = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  navLinks.forEach(link => {
    const href = (link.getAttribute("href") || "").toLowerCase();
    if (href === current) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
  });
})();

/* =======================
   SMOOTH SCROLL ÂNCORAS
   ======================= */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener("click", function (e) {
    const id = this.getAttribute("href").slice(1);
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth" });
    }
  });
});

/* =======================
   MICRO-INTERAÇÕES BOTÕES
   ======================= */
document.querySelectorAll(".btn").forEach(btn => {
  let hovered = false;
  btn.addEventListener("mouseenter", () => {
    hovered = true;
    btn.style.transform = "translateY(-2px) scale(1.02)";
  });
  btn.addEventListener("mouseleave", () => {
    if (!hovered) return;
    hovered = false;
    btn.style.transform = "";
  });
});

/* =======================
   MAPA (contato) → abre Google Maps
   ======================= */
const map = document.querySelector(".map-placeholder");
if (map) {
  map.addEventListener("click", () => {
    window.open("https://goo.gl/maps/7KfM2Z2DkHfXo7wU8", "_blank", "noopener,noreferrer");
  });
}
/* =======================
   THEME TOGGLE (light/dark) c/ persistência
   ======================= */
(function(){
  const STORAGE_KEY = "moreno-theme";
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // aplica tema salvo ou preferência do sistema
  const saved = localStorage.getItem(STORAGE_KEY);
  const initialDark = saved ? saved === "dark" : prefersDark;
  document.body.classList.toggle("dark", initialDark);

  // cria toggle se não existir (acessível)
  function ensureToggle(){
    if (document.querySelector("[data-theme-toggle]")) return;
    const nav = document.querySelector("header nav");
    if (!nav) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn ghost";
    btn.setAttribute("data-theme-toggle","");
    btn.setAttribute("aria-pressed", initialDark ? "true" : "false");
    btn.textContent = initialDark ? "☀︎":"☾";
    btn.style.marginLeft = "12px";
    nav.appendChild(btn);
  }

  ensureToggle();

  // escuta cliques
  document.addEventListener("click", (e)=>{
    const t = e.target;
    if (!t || !t.matches("[data-theme-toggle]")) return;
    const isDark = document.body.classList.toggle("dark");
    t.setAttribute("aria-pressed", isDark ? "true" : "false");
    t.textContent = isDark ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
  });

  // se sistema mudar, respeita quando usuário não escolheu manualmente
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (m)=>{
    const manual = localStorage.getItem(STORAGE_KEY);
    if (manual) return; // usuário já escolheu
    document.body.classList.toggle("dark", m.matches);
  });
})();
// Prefetch de páginas internas ao passar o mouse nos cards (fluidez)
document.addEventListener('mouseover', (e) => {
  const a = e.target.closest('a[href^="/projetos/"]');
  if (a && !a.dataset.prefetched) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = a.getAttribute('href');
    document.head.appendChild(link);
    a.dataset.prefetched = '1';
  }
});
/* =======================
   FILTRO DE PROJETOS (client-side) + URL sync
   ======================= */
(function(){
  const grid = document.getElementById("grid-projetos");
  if (!grid) return;

  const q    = document.getElementById("f-q");
  const tipo = document.getElementById("f-tipo");
  const ano  = document.getElementById("f-ano");
  const clear= document.getElementById("f-clear");
  const count= document.getElementById("f-count");
  const cards= Array.from(grid.querySelectorAll(".card"));

  function normalize(s){
    return (s||"").toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  }

  function updateCount(n){
    count.textContent = `${n} projeto${n===1?"":"s"}`;
  }

  function buildQuery(params){
    const qs = new URLSearchParams();
    for (const [k,v] of Object.entries(params)){
      if (v) qs.set(k, v);
    }
    const str = qs.toString();
    return str ? `?${str}` : "";
  }

  let isInitialApply = true; // evita empilhar histórico no primeiro apply

  function apply(pushState = false){
    const qv = normalize(q.value);
    const tv = (tipo.value||"").toLowerCase();
    const av = (ano.value||"").toLowerCase();
    let shown = 0;

    cards.forEach(card=>{
      const ct   = normalize(card.querySelector(".card-title")?.textContent);
      const cm   = normalize(card.querySelector(".card-meta")?.textContent);
      const cd   = normalize(card.querySelector(".card-desc")?.textContent);
      const tags = normalize(card.getAttribute("data-tags"));
      const tip  = (card.getAttribute("data-tipo")||"").toLowerCase();
      const yr   = (card.getAttribute("data-ano")||"").toLowerCase();

      const matchText = !qv || [ct,cm,cd,tags].some(v=>v.includes(qv));
      const matchTipo = !tv || tip === tv;
      const matchAno  = !av || yr  === av;

      const ok = matchText && matchTipo && matchAno;
      card.hidden = !ok;
      if (ok) shown++;
    });

    updateCount(shown);

    // Atualiza URL
    const params = {
      q: q.value.trim(),
      tipo: tipo.value || "",
      ano: ano.value || ""
    };
    const newQuery = buildQuery(params);
    const newUrl = `${location.pathname}${newQuery}${location.hash||""}`;

    if (isInitialApply){
      history.replaceState(params, "", newUrl); // grava estado inicial
      isInitialApply = false;
    } else {
      if (pushState) history.pushState(params, "", newUrl);
      else history.replaceState(params, "", newUrl);
    }
  }

  function setFromURL(){
    const sp = new URLSearchParams(location.search);
    const qVal    = sp.get("q")    || "";
    const tipoVal = sp.get("tipo") || "";
    const anoVal  = sp.get("ano")  || "";

    q.value = qVal;

    // Seleciona a opção somente se existir
    if ([...tipo.options].some(o => o.value.toLowerCase() === tipoVal.toLowerCase())){
      tipo.value = [...tipo.options].find(o => o.value.toLowerCase() === tipoVal.toLowerCase())?.value || "";
    } else {
      tipo.value = "";
    }
    if ([...ano.options].some(o => o.value.toLowerCase() === anoVal.toLowerCase())){
      ano.value = [...ano.options].find(o => o.value.toLowerCase() === anoVal.toLowerCase())?.value || "";
    } else {
      ano.value = "";
    }
  }

  // Eventos
  q?.addEventListener("input", () => apply(false));          // replaceState para digitação
  tipo?.addEventListener("change", () => apply(true));       // pushState em mudanças “discretas”
  ano?.addEventListener("change", () => apply(true));
  clear?.addEventListener("click", ()=>{
    q.value = ""; tipo.value = ""; ano.value = "";
    apply(true);
  });

  // Back/forward: recarrega filtros e aplica
  window.addEventListener("popstate", (ev)=>{
    const state = ev.state || {};
    q.value    = state.q    || "";
    tipo.value = state.tipo || "";
    ano.value  = state.ano  || "";
    apply(false);
  });

  // Inicial: lê URL, aplica e fixa estado base
  setFromURL();
  apply(false);
})();