// reveal simples
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!prefersReduced && 'IntersectionObserver' in window){
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, {threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
}

// marcar item ativo do menu conforme página
(function(){
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(a=>{
    if(a.getAttribute('href') === path){
      a.classList.add('is-active');
      a.setAttribute('aria-current','page');
    }
  });
})();
