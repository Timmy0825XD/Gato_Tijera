/* Deck navigation: instant keyboard response, interruptible CSS transitions. */
let cur = 0;
const slides = () => [...document.querySelectorAll('.slide')];
function show(i){
  const S = slides();
  cur = (i + S.length) % S.length;
  S.forEach((s,k)=>{
    const on = k === cur;
    s.setAttribute('aria-hidden', on ? 'false' : 'true');
    if(on && !s.classList.contains('active')){
      // retrigger the single authored entrance
      const sh = s.querySelector('.sheet');
      s.classList.add('active');
      if(sh){ sh.style.animation = 'none'; void sh.offsetWidth; sh.style.animation = ''; }
    } else s.classList.toggle('active', on);
  });
  document.getElementById('bar').style.transform = 'scaleX('+((cur+1)/S.length)+')';
  document.getElementById('count').textContent = (cur+1)+' / '+S.length;
  const d = document.getElementById('dots'); d.innerHTML='';
  S.forEach((_,k)=>{ const b=document.createElement('button'); if(k===cur)b.className='on';
    b.setAttribute('aria-label','Ir a la diapositiva '+(k+1)); b.onclick=()=>show(k); d.appendChild(b); });
}
function next(){ show(cur+1); } function prev(){ show(cur-1); }
document.addEventListener('keydown', e=>{
  if(e.key==='ArrowRight'||e.key===' '){ e.preventDefault(); next(); }
  else if(e.key==='ArrowLeft'){ e.preventDefault(); prev(); }
  else if(e.key==='Home'){ show(0); }
  else if(e.key==='End'){ show(slides().length-1); }
});
let x0=null;
document.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true});
document.addEventListener('touchend',e=>{ if(x0==null)return; const dx=e.changedTouches[0].clientX-x0;
  if(dx<-40)next(); else if(dx>40)prev(); x0=null; },{passive:true});
show(0);
