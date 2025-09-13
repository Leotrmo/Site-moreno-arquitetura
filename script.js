// Respeita prefers-reduced-motion
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Botão para desligar movimento manualmente
const toggle = document.querySelector('.motion-toggle');
if (toggle){
  toggle.addEventListener('click', ()=>{
    const on = document.documentElement.classList.toggle('no-motion');
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

// Scroll reveal
if(!prefersReduced && 'IntersectionObserver' in window){
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, {threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
}

// Smooth anchors
document.querySelectorAll('a[href^="#"]').forEach(link=>{
  link.addEventListener('click', (e)=>{
    const id = link.getAttribute('href');
    const el = document.querySelector(id);
    if(el){
      e.preventDefault();
      el.scrollIntoView({behavior: (prefersReduced || document.documentElement.classList.contains('no-motion')) ? 'auto' : 'smooth'});
    }
  });
});

// Parallax leve nos cards
document.querySelectorAll('.parallax').forEach(box=>{
  let raf = null;
  const img = box.querySelector('img');
  box.addEventListener('mousemove', (e)=>{
    if(prefersReduced || document.documentElement.classList.contains('no-motion')) return;
    const r = box.getBoundingClientRect();
    const dx = (e.clientX - r.left)/r.width - 0.5;
    const dy = (e.clientY - r.top)/r.height - 0.5;
    if(raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(()=>{ img.style.transform = `scale(1.06) translate(${dx*6}px, ${dy*6}px)`; });
  });
  box.addEventListener('mouseleave', ()=>{
    if(raf) cancelAnimationFrame(raf);
    img.style.transform = '';
  });
});
