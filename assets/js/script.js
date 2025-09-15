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