/* ===== UTIL GERAL ===== */
(function(){
  // Preloader + modo "preload" evita flash de transição
  document.documentElement.classList.add('preload');
  window.addEventListener('load', () => {
    document.documentElement.classList.remove('preload');
    document.body.classList.add('is-loaded');
  });

  // Reveal on scroll
  const obs = ('IntersectionObserver' in window) ? new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){ e.target.classList.add('in'); obs.unobserve(e.target); }
    });
  },{threshold:.2}) : null;

  document.querySelectorAll('.reveal').forEach(el=>{
    if (obs) obs.observe(el); else el.classList.add('in');
  });

  // Toggle de tema (persistente)
  const nav = document.querySelector('header nav');
  if (nav){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label','Alternar tema');
    btn.style.marginLeft = '16px';
    btn.className = 'btn ghost';
    const THEMESTORE = 'moreno-theme';
    const setLabel = () => btn.textContent = document.body.classList.contains('dark') ? '☀︎' : '☾';

    const saved = localStorage.getItem(THEMESTORE);
    if(saved === 'dark') document.body.classList.add('dark');
    setLabel();

    btn.addEventListener('click', ()=>{
      document.body.classList.toggle('dark');
      localStorage.setItem(THEMESTORE, document.body.classList.contains('dark') ? 'dark':'light');
      setLabel();
    });

    nav.appendChild(btn);
  }

  // Prefetch de páginas de projetos ao pairar
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
})();

/* ===== FILTRO DE PROJETOS + URL + BADGES + FACETS + DISABLED + ANIMAÇÃO ===== */
(function(){
  const grid  = document.getElementById("grid-projetos");
  if (!grid) return;

  const q     = document.getElementById("f-q");
  const tipo  = document.getElementById("f-tipo");
  const ano   = document.getElementById("f-ano");
  const clear = document.getElementById("f-clear");
  const count = document.getElementById("f-count");
  const badgesWrap = document.getElementById("f-badges");
  const cards = Array.from(grid.querySelectorAll(".card"));

  const baseLabels = {
    tipo: Array.from(tipo.options).map(o => o.textContent),
    ano:  Array.from(ano.options ).map(o => o.textContent)
  };

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const normalize = s => (s||"").toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"");

  const updateCount = n => { count.textContent = `${n} projeto${n===1?"":"s"}`; };

  function buildQuery(params){
    const qs = new URLSearchParams();
    for (const [k,v] of Object.entries(params)){ if (v) qs.set(k, v); }
    const str = qs.toString(); return str ? `?${str}` : "";
  }

  // animações de cards
  function fadeOutCard(card){
    if (prefersReduced){ card.hidden = true; card.classList.remove("is-hiding","is-enter"); return; }
    if (card.hidden) return;
    card.classList.add("is-hiding");
    const onEnd = (e)=>{
      if (e && e.target !== card) return;
      card.removeEventListener("transitionend", onEnd);
      card.hidden = true;
      card.classList.remove("is-hiding","is-enter");
    };
    card.addEventListener("transitionend", onEnd);
  }
  function fadeInCard(card){
    if (!card.hidden) return;
    if (prefersReduced){ card.hidden=false; card.classList.remove("is-hiding","is-enter"); return; }
    card.hidden=false; card.classList.add("is-enter");
    void card.offsetWidth; requestAnimationFrame(()=> card.classList.remove("is-enter"));
  }

  // facets
  function computeTipoCounts(qv, anoSel){
    const map = new Map();
    cards.forEach(card=>{
      const ct=normalize(card.querySelector(".card-title")?.textContent);
      const cm=normalize(card.querySelector(".card-meta")?.textContent);
      const cd=normalize(card.querySelector(".card-desc")?.textContent);
      const tags=normalize(card.getAttribute("data-tags"));
      const yr=(card.getAttribute("data-ano")||"").toLowerCase();
      const okText=!qv||[ct,cm,cd,tags].some(v=>v.includes(qv));
      const okAno =!anoSel|| yr===anoSel.toLowerCase();
      if(!(okText&&okAno)) return;
      const tip=(card.getAttribute("data-tipo")||"").trim(); if(!tip) return;
      map.set(tip,(map.get(tip)||0)+1);
    }); return map;
  }
  function computeAnoCounts(qv, tipoSel){
    const map = new Map();
    cards.forEach(card=>{
      const ct=normalize(card.querySelector(".card-title")?.textContent);
      const cm=normalize(card.querySelector(".card-meta")?.textContent);
      const cd=normalize(card.querySelector(".card-desc")?.textContent);
      const tags=normalize(card.getAttribute("data-tags"));
      const tip=(card.getAttribute("data-tipo")||"").toLowerCase();
      const okText=!qv||[ct,cm,cd,tags].some(v=>v.includes(qv));
      const okTipo=!tipoSel|| tip===tipoSel.toLowerCase();
      if(!(okText&&okTipo)) return;
      const yr=(card.getAttribute("data-ano")||"").trim(); if(!yr) return;
      map.set(yr,(map.get(yr)||0)+1);
    }); return map;
  }
  function updateFacetCounts(qv){
    const tipoCounts = computeTipoCounts(qv, tipo.value);
    Array.from(tipo.options).forEach((opt,i)=>{
      const base = baseLabels.tipo[i];
      if(!opt.value){ opt.textContent=base; opt.disabled=false; return; }
      const n = tipoCounts.get(opt.value)||0;
      opt.textContent = `${opt.value} (${n})`; opt.disabled = (n===0);
    });
    const anoCounts = computeAnoCounts(qv, tipo.value);
    Array.from(ano.options).forEach((opt,i)=>{
      const base = baseLabels.ano[i];
      if(!opt.value){ opt.textContent=base; opt.disabled=false; return; }
      const n = anoCounts.get(opt.value)||0;
      opt.textContent = `${opt.value} (${n})`; opt.disabled = (n===0);
    });
  }

  // badges
  function renderBadges(params){
    if(!badgesWrap) return; badgesWrap.innerHTML="";
    const entries=[];
    if(params.q) entries.push(["q","busca",params.q]);
    if(params.tipo) entries.push(["tipo","tipologia",params.tipo]);
    if(params.ano) entries.push(["ano","ano",params.ano]);
    for(const [key,label,val] of entries){
      const el=document.createElement("span");
      el.className="badge";
      el.innerHTML=`<span class="k">${label}:</span><span class="v">${val}</span>
                    <button type="button" aria-label="Remover ${label}">×</button>`;
      el.querySelector("button").addEventListener("click",()=>{
        if(key==="q") q.value="";
        if(key==="tipo") tipo.value="";
        if(key==="ano") ano.value="";
        apply(true);
      });
      badgesWrap.appendChild(el);
    }
  }

  let isInitialApply = true;

  function apply(pushState=false){
    const qv = normalize(q.value);
    const tv = (tipo.value||"").toLowerCase();
    const av = (ano.value||"").toLowerCase();
    let shown=0;

    cards.forEach(card=>{
      const ct=normalize(card.querySelector(".card-title")?.textContent);
      const cm=normalize(card.querySelector(".card-meta")?.textContent);
      const cd=normalize(card.querySelector(".card-desc")?.textContent);
      const tags=normalize(card.getAttribute("data-tags"));
      const tip=(card.getAttribute("data-tipo")||"").toLowerCase();
      const yr =(card.getAttribute("data-ano")||"").toLowerCase();

      const matchText=!qv||[ct,cm,cd,tags].some(v=>v.includes(qv));
      const matchTipo=!tv||tip===tv;
      const matchAno =!av||yr===av;
      const ok = matchText && matchTipo && matchAno;

      if (ok){ shown++; fadeInCard(card); } else { fadeOutCard(card); }
    });

    updateCount(shown);
    updateFacetCounts(qv);

    const params = { q:q.value.trim(), tipo:tipo.value||"", ano:ano.value||"" };
    renderBadges(params);
    const newUrl = `${location.pathname}${buildQuery(params)}${location.hash||""}`;

    if (isInitialApply){ history.replaceState(params,"",newUrl); isInitialApply=false; }
    else { if (pushState) history.pushState(params,"",newUrl); else history.replaceState(params,"",newUrl); }
  }

  function setFromURL(){
    const sp=new URLSearchParams(location.search);
    const qVal=sp.get("q")||"", tipoVal=sp.get("tipo")||"", anoVal=sp.get("ano")||"";
    q.value=qVal;
    tipo.value=[...tipo.options].find(o=>o.value.toLowerCase()===tipoVal.toLowerCase())?.value||"";
    ano.value=[...ano.options ].find(o=>o.value.toLowerCase()===anoVal.toLowerCase())?.value ||"";
  }

  q?.addEventListener("input", ()=>apply(false));
  tipo?.addEventListener("change", ()=>apply(true));
  ano?.addEventListener("change", ()=>apply(true));
  clear?.addEventListener("click", ()=>{ q.value=""; tipo.value=""; ano.value=""; apply(true); });

  window.addEventListener("popstate", (ev)=>{
    const st=ev.state||{}; q.value=st.q||""; tipo.value=st.tipo||""; ano.value=st.ano||""; apply(false);
  });

  setFromURL(); apply(false);
})();

/* ===== GALERIA: helpers para tabs/filtros futuros ===== */
(function(){
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function fadeOut(el){
    if (prefersReduced){ el.hidden=true; el.classList.remove("is-hiding","is-enter"); return; }
    if (el.hidden) return;
    el.classList.add("is-hiding");
    const onEnd=(e)=>{ if(e && e.target!==el) return; el.removeEventListener("transitionend",onEnd); el.hidden=true; el.classList.remove("is-hiding","is-enter"); };
    el.addEventListener("transitionend", onEnd);
  }
  function fadeIn(el){
    if (!el.hidden) return;
    if (prefersReduced){ el.hidden=false; el.classList.remove("is-hiding","is-enter"); return; }
    el.hidden=false; el.classList.add("is-enter"); void el.offsetWidth; requestAnimationFrame(()=> el.classList.remove("is-enter"));
  }
  window.MorenoGallery = {
    show(selector){ document.querySelectorAll(selector).forEach(fadeIn); },
    hide(selector){ document.querySelectorAll(selector).forEach(fadeOut); },
    switch({show=[], hide=[]}={}){ hide.forEach(sel=>document.querySelectorAll(sel).forEach(fadeOut)); requestAnimationFrame(()=>{ show.forEach(sel=>document.querySelectorAll(sel).forEach(fadeIn)); }); }
  };
})();