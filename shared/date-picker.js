var MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

var dpState = {
  viewYear:1990, viewMonth:0,
  selYear:null, selMonth:null, selDay:null,
  yearMode:false, monthMode:false,
  onConfirm:null
};

function parseFecha(str) {
  if (!str) return null;
  var iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { month:parseInt(iso[2])-1, day:parseInt(iso[3]), year:parseInt(iso[1]) };
  var slash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) { var a=parseInt(slash[1]),b=parseInt(slash[2]),y=parseInt(slash[3]); return b>12?{day:b,month:a-1,year:y}:{day:a,month:b-1,year:y}; }
  return null;
}

function formatFecha(y,m,d) {
  return String(d).padStart(2,'0')+'/'+String(m+1).padStart(2,'0')+'/'+y;
}

function abrirDatePicker(valorActual, onConfirm) {
  var parsed = parseFecha(valorActual);
  dpState.viewYear  = (parsed && parsed.year)  ? parsed.year  : 1990;
  dpState.viewMonth = (parsed && typeof parsed.month==='number') ? parsed.month : 0;
  dpState.selYear   = parsed ? parsed.year  : null;
  dpState.selMonth  = (parsed && typeof parsed.month==='number') ? parsed.month : null;
  dpState.selDay    = parsed ? parsed.day   : null;
  dpState.yearMode  = false; dpState.monthMode = false;
  dpState.onConfirm = onConfirm;
  var errEl = document.getElementById('dp-error');
  if (errEl) { errEl.style.display='none'; errEl.textContent=''; }
  renderDatePicker();
  document.getElementById('date-picker-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function cerrarDatePicker() {
  document.getElementById('date-picker-modal').classList.remove('active');
  document.body.style.overflow = '';
}

function renderDatePicker() {
  var safeMonth = (Number.isInteger(dpState.viewMonth) && dpState.viewMonth>=0 && dpState.viewMonth<=11) ? dpState.viewMonth : 0;
  var safeYear  = (Number.isInteger(dpState.viewYear)  && dpState.viewYear>1900) ? dpState.viewYear : 1990;
  var lbl = document.getElementById('dp-selected-label');
  if (lbl) lbl.textContent = (Number.isInteger(dpState.selYear) && Number.isInteger(dpState.selMonth) && Number.isInteger(dpState.selDay)) ? dpState.selDay+' '+MESES[dpState.selMonth]+' '+dpState.selYear : 'Sin seleccionar';
  var monthEl = document.getElementById('dp-month-label');
  var yearEl  = document.getElementById('dp-year-label');
  if (monthEl) monthEl.textContent = MESES[safeMonth];
  if (yearEl)  yearEl.textContent  = safeYear;
  var gridWrap  = document.getElementById('dp-grid-wrap');
  var yearGrid  = document.getElementById('dp-year-grid');
  var monthGrid = document.getElementById('dp-month-grid');
  if (dpState.yearMode) {
    gridWrap.style.display='none'; yearGrid.style.display='grid'; if(monthGrid) monthGrid.style.display='none';
    renderYearGrid();
  } else if (dpState.monthMode) {
    gridWrap.style.display='none'; yearGrid.style.display='none'; if(monthGrid){monthGrid.style.display='grid'; renderMonthGrid();}
  } else {
    gridWrap.style.display='block'; yearGrid.style.display='none'; if(monthGrid) monthGrid.style.display='none';
    renderDaysGrid();
  }
}

function renderDaysGrid() {
  var vy = (Number.isInteger(dpState.viewYear) && dpState.viewYear>1900) ? dpState.viewYear : 1990;
  var vm = (Number.isInteger(dpState.viewMonth) && dpState.viewMonth>=0 && dpState.viewMonth<=11) ? dpState.viewMonth : 0;
  var daysEl = document.getElementById('dp-days');
  daysEl.innerHTML='';
  var firstDay = new Date(vy,vm,1).getDay();
  var daysInMonth = new Date(vy,vm+1,0).getDate();
  var offset = (firstDay+6)%7;
  var today = new Date();
  for (var i=0; i<offset; i++) { var b=document.createElement('div'); b.className='dp-day dp-other-month'; daysEl.appendChild(b); }
  for (var d=1; d<=daysInMonth; d++) {
    (function(day){
      var btn=document.createElement('button'); btn.type='button'; btn.className='dp-day'; btn.textContent=day;
      var isSel = dpState.selYear===vy && dpState.selMonth===vm && dpState.selDay===day;
      var isToday = today.getFullYear()===vy && today.getMonth()===vm && today.getDate()===day;
      if (isSel) btn.classList.add('dp-selected'); else if (isToday) btn.classList.add('dp-today');
      btn.addEventListener('click',function(){ dpState.selYear=vy; dpState.selMonth=vm; dpState.selDay=day; animateDp(); renderDatePicker(); });
      daysEl.appendChild(btn);
    })(d);
  }
}

function renderYearGrid() {
  var yearGrid=document.getElementById('dp-year-grid'); yearGrid.innerHTML='';
  var curYear=new Date().getFullYear();
  for (var y=curYear; y>=1920; y--) {
    (function(yr){
      var btn=document.createElement('button'); btn.type='button';
      btn.className='dp-year-btn'+(yr===dpState.viewYear?' dp-year-selected':''); btn.textContent=yr;
      btn.addEventListener('click',function(){ dpState.viewYear=yr; dpState.selYear=yr; dpState.yearMode=false; dpState.monthMode=false; if(typeof dpState.viewMonth!=='number'||dpState.viewMonth<0||dpState.viewMonth>11) dpState.viewMonth=0; animateDp(); renderDatePicker(); });
      yearGrid.appendChild(btn);
    })(y);
  }
  requestAnimationFrame(function(){ var sel=yearGrid.querySelector('.dp-year-selected'); if(sel) sel.scrollIntoView({block:'center'}); });
}

function renderMonthGrid() {
  var monthGrid=document.getElementById('dp-month-grid'); if(!monthGrid) return; monthGrid.innerHTML='';
  MESES.forEach(function(nombre,idx){
    var btn=document.createElement('button'); btn.type='button';
    btn.className='dp-month-btn'+(idx===dpState.viewMonth?' dp-month-selected':''); btn.textContent=nombre;
    btn.addEventListener('click',function(){ dpState.viewMonth=idx; dpState.selMonth=idx; dpState.monthMode=false; animateDp(); renderDatePicker(); });
    monthGrid.appendChild(btn);
  });
}

function animateDp() {
  var targets=['dp-grid-wrap','dp-year-grid','dp-month-grid','dp-month-label','dp-year-label','dp-selected-label','dp-days'].map(function(id){return document.getElementById(id);});
  targets.forEach(function(el){ if(!el) return; el.style.transition='none'; el.style.opacity='0'; el.style.transform='translateY(4px)'; });
  requestAnimationFrame(function(){ requestAnimationFrame(function(){
    targets.forEach(function(el){ if(!el) return; el.style.transition='opacity 0.18s ease, transform 0.18s cubic-bezier(0.4,0,0.2,1)'; el.style.opacity='1'; el.style.transform='translateY(0)'; });
  });});
}

function initDatePickerListeners() {
  document.getElementById('dp-prev')&&document.getElementById('dp-prev').addEventListener('click',function(){ dpState.viewMonth--; if(dpState.viewMonth<0){dpState.viewMonth=11;dpState.viewYear--;} animateDp('prev'); renderDatePicker(); });
  document.getElementById('dp-next')&&document.getElementById('dp-next').addEventListener('click',function(){ dpState.viewMonth++; if(dpState.viewMonth>11){dpState.viewMonth=0;dpState.viewYear++;} animateDp('next'); renderDatePicker(); });
  var dpModal=document.getElementById('date-picker-modal');
  if (dpModal) {
    dpModal.addEventListener('click',function(e){
      var tgt=e.target;
      if (tgt.id==='dp-month-label'||tgt.closest&&tgt.closest('#dp-month-label')) { e.preventDefault(); e.stopPropagation(); dpState.monthMode=!dpState.monthMode; dpState.yearMode=false; animateDp(); renderDatePicker(); }
      else if (tgt.id==='dp-year-label'||tgt.closest&&tgt.closest('#dp-year-label')) { e.preventDefault(); e.stopPropagation(); dpState.yearMode=!dpState.yearMode; dpState.monthMode=false; animateDp(); renderDatePicker(); }
      else if (tgt===dpModal) cerrarDatePicker();
    });
  }
  document.getElementById('dp-cancel')&&document.getElementById('dp-cancel').addEventListener('click',cerrarDatePicker);
  document.getElementById('dp-ok')&&document.getElementById('dp-ok').addEventListener('click',function(){
    var errEl=document.getElementById('dp-error');
    if (!dpState.selDay) { if(errEl){errEl.textContent='Falta seleccionar el día';errEl.style.display='block';clearTimeout(errEl._t);errEl._t=setTimeout(function(){errEl.style.display='none';},3000);} return; }
    if (errEl) errEl.style.display='none';
    var val=formatFecha(dpState.selYear,dpState.selMonth,dpState.selDay);
    if (dpState.onConfirm) dpState.onConfirm(val);
    cerrarDatePicker();
  });
}
