// ritmo/js/views/supplies.js
import { el, openSheet, closeSheet, toast } from '../ui.js';
import * as Store from '../store.js';

const UNITS = ['ml', 'g', 'unidad', 'L', 'kg'];
const PALETTE = ['#748B5C','#BF5B3E','#3E6259','#C98F2A','#9C9277','#5B7A8C','#8C5B7A','#5B6B8C'];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function fmtNum(n, unit, dec = 1) {
  return `${(+n||0).toLocaleString('es-PY',{maximumFractionDigits:dec})} ${unit}`;
}
function humanDays(n) {
  const a = Math.abs(Math.round(n));
  if (a < 14) return `${a} día${a!==1?'s':''}`;
  if (a < 60) { const w=Math.round(a/7); return `${w} semana${w!==1?'s':''}`; }
  const m=Math.round(a/30.44); return `${m} mes${m!==1?'es':''}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  const [y,m,d]=iso.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('es-PY',{day:'numeric',month:'short',year:'numeric'});
}
function row12(label, value) {
  return el('div', {style:'display:flex;justify-content:space-between;font-size:12.5px;padding:2px 0;color:var(--ink-soft);'}, [
    el('span',{},label), el('span',{style:'color:var(--ink);font-weight:500;'},value),
  ]);
}
function miniStat(num, label) {
  return el('div', {class:'stat-box',style:'padding:10px 12px;'}, [
    el('div',{class:'num',style:'font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'},String(num)),
    el('div',{class:'label'},label),
  ]);
}

// ---------- stats engine ----------

export function supplyStats(supply) {
  const today = todayISO();
  const batches = supply.batches || [];
  const closed  = batches.filter(b=>b.endDate).sort((a,b)=>b.endDate.localeCompare(a.endDate));
  const active  = batches.filter(b=>!b.endDate).sort((a,b)=>b.startDate.localeCompare(a.startDate));
  const current = active[0] || null;

  // Rate from closed batches (avg across all)
  let ratePerDay = null;
  const validClosed = closed.filter(b=>daysBetween(b.startDate,b.endDate)>0);
  if (validClosed.length) {
    const rates = validClosed.map(b=>(Number(b.quantity)||0)/daysBetween(b.startDate,b.endDate));
    ratePerDay = rates.reduce((s,r)=>s+r,0)/rates.length;
  }
  const fallback = (supply.estimatedDailyPerPerson||0)*(supply.peopleCount||1);
  const effectiveRate = ratePerDay ?? (fallback>0 ? fallback : null);

  // Current container projection
  let pctUsed=0, amountUsed=0, amountLeft=null, daysLeft=null;
  if (current && effectiveRate) {
    const elapsed = Math.max(0,daysBetween(current.startDate,today));
    amountUsed = effectiveRate * elapsed;
    amountLeft = Math.max(0,(Number(current.quantity)||0)-amountUsed);
    pctUsed    = Math.min(1, amountUsed/(Number(current.quantity)||1));
    daysLeft   = amountLeft/effectiveRate;
  }

  let status = 'sin_datos';
  if (current) {
    if (!effectiveRate)          status = 'sin_tasa';
    else if (daysLeft > 14)      status = 'ok';
    else if (daysLeft >= 0)      status = 'poco';
    else                         status = 'agotado';
  } else if (closed.length > 0) status = 'sin_envase';

  const people = supply.peopleCount || 1;
  const ratePerPerson  = effectiveRate ? effectiveRate/people : null;
  const monthlyTotal   = effectiveRate ? effectiveRate*30.44  : null;
  const yearlyTotal    = effectiveRate ? effectiveRate*365.25 : null;
  const monthlyPerPerson = ratePerPerson ? ratePerPerson*30.44 : null;
  const ps = supply.purchaseSize||0;
  const containersPerYear = (yearlyTotal&&ps) ? yearlyTotal/ps : null;
  const avgDuration = validClosed.length
    ? validClosed.reduce((s,b)=>s+daysBetween(b.startDate,b.endDate),0)/validClosed.length
    : null;

  return { current, closed, active, effectiveRate, ratePerDay, ratePerPerson,
    pctUsed, amountUsed, amountLeft, daysLeft, status,
    monthlyTotal, yearlyTotal, monthlyPerPerson, containersPerYear,
    avgDuration, batchCount: batches.length };
}

const STATUS_COLOR = {
  ok:'var(--olive)', poco:'var(--ochre)', agotado:'var(--terracotta)',
  sin_datos:'var(--sand)', sin_tasa:'var(--sand)', sin_envase:'var(--terracotta)',
};
const STATUS_LABEL = {
  ok:'Disponible', poco:'Poco queda', agotado:'Agotado',
  sin_datos:'Sin datos', sin_tasa:'Sin historial aún', sin_envase:'Necesita reposición',
};

// ---------- list ----------

export const fab = { label:'Nuevo suministro', onClick:()=>openSupplyForm(null) };

export function renderSuppliesList(container) {
  const items = Store.listSupplies().filter(s=>!s.archived);
  if (!items.length) {
    container.appendChild(el('div',{class:'empty-state'},[
      el('div',{class:'glyph'},'🪥'),
      el('div',{},'Todavía no hay suministros. Tocá + para agregar pasta de dientes, jabón, etc.'),
    ]));
    return;
  }
  const list = el('div',{class:'list',style:'padding-top:8px;'});
  for (const s of items) list.appendChild(renderCard(s));
  container.appendChild(list);
}

function renderCard(supply) {
  const s = supplyStats(supply);
  const color = supply.color || 'var(--teal)';
  const sc = STATUS_COLOR[s.status];
  const card = el('div',{class:'card',style:'cursor:pointer;'});
  card.appendChild(el('div',{style:`position:absolute;left:0;top:0;bottom:0;width:4px;background:${color};border-radius:4px 0 0 4px;`}));

  // header
  const header = el('div',{style:'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;'});
  header.appendChild(el('div',{style:'display:flex;align-items:center;gap:8px;'},[
    el('span',{style:'font-size:20px;'},supply.icon||'🧴'),
    el('span',{style:'font-size:15px;font-weight:600;'},supply.name),
    supply.peopleCount>1 ? el('span',{class:'tag-pill'},`👥 ${supply.peopleCount}`) : null,
  ]));
  header.appendChild(el('span',{class:'tag-pill',style:`background:${sc};color:#fff;font-size:11px;`},STATUS_LABEL[s.status]));
  card.appendChild(header);

  // progress
  if (s.current && s.effectiveRate) {
    const bar = el('div',{class:'progress-bar',style:'margin-bottom:6px;'});
    bar.appendChild(el('div',{style:`width:${Math.round(s.pctUsed*100)}%;background:${sc};`}));
    card.appendChild(bar);
    const info = el('div',{style:'display:flex;justify-content:space-between;font-size:12px;color:var(--ink-soft);margin-bottom:8px;'});
    if (s.amountLeft!==null) info.appendChild(el('span',{},`~${fmtNum(s.amountLeft,supply.unit)} restantes`));
    if (s.daysLeft!==null) info.appendChild(el('span',{style:s.daysLeft<0?'color:var(--terracotta);':''},
      s.daysLeft>=0 ? `Queda ~${humanDays(s.daysLeft)}` : `Se acabó hace ~${humanDays(-s.daysLeft)}`));
    card.appendChild(info);
  } else if (s.current) {
    card.appendChild(el('div',{style:'font-size:12px;color:var(--ink-soft);margin-bottom:8px;'},
      `Iniciado el ${fmtDate(s.current.startDate)} · ${fmtNum(s.current.quantity,supply.unit)} · Finalizá para calcular la tasa`));
  }

  // bottom row
  const bottom = el('div',{style:'display:flex;align-items:center;justify-content:space-between;gap:8px;'});
  bottom.appendChild(el('span',{style:'font-size:12px;color:var(--ink-soft);'},
    s.effectiveRate
      ? `${fmtNum(s.effectiveRate,supply.unit)}/día · ${fmtNum(s.monthlyTotal,supply.unit)}/mes`
      : s.current ? 'Finalizá el envase para calcular el ritmo' : 'Abrí un envase para empezar'));
  const btn = s.current
    ? el('button',{class:'btn btn-secondary',style:'width:auto;padding:6px 12px;font-size:12px;',
        onClick:(e)=>{e.stopPropagation();openFinishBatch(supply,s.current);}}, '✅ Finalizar')
    : el('button',{class:'btn btn-primary',style:'width:auto;padding:6px 12px;font-size:12px;',
        onClick:(e)=>{e.stopPropagation();openNewBatch(supply);}}, '📦 Abrir envase');
  bottom.appendChild(btn);
  card.appendChild(bottom);
  card.addEventListener('click',()=>openSupplyDetail(supply));
  return card;
}

// ---------- open / finish batch ----------

function openNewBatch(supply) {
  const dateInput = el('input',{type:'date',value:todayISO()});
  const qtyInput  = el('input',{type:'number',min:'0',step:'0.1',
    placeholder:supply.purchaseSize?String(supply.purchaseSize):`Cantidad en ${supply.unit}`,
    value:supply.purchaseSize||''});
  const notesInput = el('input',{type:'text',placeholder:'Ej: marca nueva, tamaño grande…'});
  const saveBtn = el('button',{class:'btn btn-primary'},'Abrir envase');
  saveBtn.addEventListener('click',()=>{
    const qty=parseFloat(qtyInput.value);
    if(!qty||qty<=0){toast('Ingresá la cantidad.');return;}
    Store.addSupplyBatch(supply.id,{startDate:dateInput.value,quantity:qty,notes:notesInput.value.trim()});
    closeSheet(); toast(`Envase de ${fmtNum(qty,supply.unit)} abierto ✓`);
  });
  openSheet(el('div',{},[
    el('div',{class:'field'},[el('label',{},'Fecha de inicio'),dateInput]),
    el('div',{class:'field'},[el('label',{},`Cantidad (${supply.unit})`),qtyInput]),
    el('div',{class:'field'},[el('label',{},'Notas'),notesInput]),
    saveBtn,
  ]),{title:`📦 Abrir envase — ${supply.name}`});
}

function openFinishBatch(supply, batch) {
  const dateInput  = el('input',{type:'date',value:todayISO()});
  const notesInput = el('input',{type:'text',value:batch.notes||''});
  const days = daysBetween(batch.startDate,todayISO());
  const info = el('div',{style:'font-size:12.5px;color:var(--ink-soft);margin-bottom:12px;'},
    `Iniciado el ${fmtDate(batch.startDate)} (hace ${humanDays(days)}) · ${fmtNum(batch.quantity,supply.unit)}`);
  const saveBtn = el('button',{class:'btn btn-primary'},'Marcar como terminado');
  saveBtn.addEventListener('click',()=>{
    if(!dateInput.value){toast('Elegí la fecha de finalización.');return;}
    Store.closeSupplyBatch(supply.id,batch.id,dateInput.value);
    closeSheet(); toast('Envase finalizado — tasa actualizada ✓');
  });
  const nextBtn = el('button',{class:'btn btn-secondary',style:'margin-top:8px;'},'Terminar y abrir el siguiente');
  nextBtn.addEventListener('click',()=>{
    if(!dateInput.value){toast('Elegí la fecha.');return;}
    Store.closeSupplyBatch(supply.id,batch.id,dateInput.value);
    closeSheet();
    setTimeout(()=>openNewBatch(Store.getSupply(supply.id)),80);
  });
  openSheet(el('div',{},[info,
    el('div',{class:'field'},[el('label',{},'Fecha de finalización'),dateInput]),
    el('div',{class:'field'},[el('label',{},'Notas'),notesInput]),
    saveBtn, nextBtn,
  ]),{title:`✅ Finalizar — ${supply.name}`});
}

// ---------- detail sheet ----------

function openSupplyDetail(supply) {
  const wrap = el('div');
  function rebuild() {
    wrap.innerHTML='';
    const sup = Store.getSupply(supply.id); if(!sup) return;
    const s = supplyStats(sup);

    wrap.appendChild(el('div',{class:'stat-grid',style:'padding:0;margin-bottom:14px;'},[
      miniStat(s.effectiveRate?fmtNum(s.effectiveRate,sup.unit):'—','por día (todos)'),
      miniStat(s.ratePerPerson?fmtNum(s.ratePerPerson,sup.unit):'—','por persona/día'),
      miniStat(s.monthlyTotal?fmtNum(s.monthlyTotal,sup.unit):'—','por mes'),
      miniStat(s.yearlyTotal?fmtNum(s.yearlyTotal,sup.unit):'—','por año'),
    ]));

    if (s.containersPerYear||s.avgDuration) {
      const fc = el('div',{class:'card',style:'margin-bottom:14px;'});
      fc.appendChild(el('div',{style:'font-size:13px;font-weight:600;margin-bottom:6px;'},'🛒 Proyección de compras'));
      if(s.avgDuration)        fc.appendChild(row12('Duración promedio',humanDays(s.avgDuration)));
      if(s.containersPerYear)  fc.appendChild(row12('Envases por año',`~${s.containersPerYear.toLocaleString('es-PY',{maximumFractionDigits:1})}`));
      if(s.yearlyTotal)        fc.appendChild(row12('Total anual',fmtNum(s.yearlyTotal,sup.unit)));
      if(s.daysLeft!==null&&s.daysLeft>=0) fc.appendChild(row12('Próxima compra en',`~${humanDays(s.daysLeft)}`));
      wrap.appendChild(fc);
    }

    wrap.appendChild(el('div',{class:'section-label',style:'padding:0 0 8px;'},`Historial de envases (${s.batchCount})`));
    if(!sup.batches.length) {
      wrap.appendChild(el('div',{style:'color:var(--ink-soft);font-size:13px;margin-bottom:14px;'},'Sin envases registrados.'));
    } else {
      const sorted=[...sup.batches].sort((a,b)=>b.startDate.localeCompare(a.startDate));
      const bl=el('div',{style:'display:flex;flex-direction:column;gap:8px;margin-bottom:14px;'});
      for(const b of sorted) {
        const dur=b.endDate?daysBetween(b.startDate,b.endDate):daysBetween(b.startDate,todayISO());
        const rate=b.endDate&&dur>0?(Number(b.quantity)||0)/dur:null;
        const bc=el('div',{class:'card'});
        bc.appendChild(el('div',{style:'display:flex;justify-content:space-between;align-items:baseline;'},[
          el('span',{style:'font-size:14px;font-weight:600;'},fmtNum(b.quantity,sup.unit)),
          el('span',{class:'tag-pill',style:b.endDate?'':'background:var(--teal);color:#fff;'},b.endDate?'Finalizado':'Activo'),
        ]));
        bc.appendChild(row12('Inicio',fmtDate(b.startDate)));
        bc.appendChild(row12('Fin',b.endDate?fmtDate(b.endDate):'En uso'));
        bc.appendChild(row12('Duración',b.endDate?humanDays(dur):`${humanDays(dur)} hasta hoy`));
        if(rate) bc.appendChild(row12('Tasa real',`${fmtNum(rate,sup.unit)}/día`));
        if(b.notes) bc.appendChild(el('div',{class:'card-comment',style:'margin-top:6px;'},`📝 ${b.notes}`));
        const acts=el('div',{style:'display:flex;gap:10px;margin-top:8px;'});
        if(!b.endDate) acts.appendChild(el('button',{class:'btn-ghost',style:'padding:0;font-size:12px;',
          onClick:()=>{closeSheet();openFinishBatch(sup,b);}}, '✅ Finalizar'));
        acts.appendChild(el('button',{class:'btn-ghost',style:'padding:0;font-size:12px;color:var(--terracotta);',
          onClick:()=>{if(!confirm('¿Eliminar este envase?'))return;Store.deleteSupplyBatch(sup.id,b.id);rebuild();toast('Eliminado');}}, '🗑 Eliminar'));
        bc.appendChild(acts);
        bl.appendChild(bc);
      }
      wrap.appendChild(bl);
    }

    if(!s.current) wrap.appendChild(el('button',{class:'btn btn-primary',onClick:()=>{closeSheet();openNewBatch(sup);}},'📦 Abrir envase nuevo'));
    else wrap.appendChild(el('button',{class:'btn btn-secondary',onClick:()=>{closeSheet();openFinishBatch(sup,s.current);}}, '✅ Finalizar envase actual'));
    wrap.appendChild(el('button',{class:'btn btn-secondary',style:'margin-top:8px;',onClick:()=>{closeSheet();openSupplyForm(sup);}},'⚙️ Editar configuración'));
    wrap.appendChild(el('button',{class:'btn btn-danger',style:'margin-top:8px;',onClick:()=>{
      if(!confirm(`¿Eliminar "${sup.name}"?`))return;
      Store.deleteSupply(sup.id);closeSheet();toast('Eliminado');
    }},'Eliminar suministro'));
  }
  rebuild();
  openSheet(wrap,{title:`${supply.icon||'🧴'} ${supply.name}`});
}

// ---------- supply form ----------

function openSupplyForm(existing) {
  const isEdit=!!existing;
  let color=existing?.color||PALETTE[2];
  const nameInput   = el('input',{type:'text',placeholder:'Pasta de dientes, Jabón, Shampoo…',value:existing?.name||''});
  const iconInput   = el('input',{type:'text',placeholder:'🧴',value:existing?.icon||'',maxlength:'2',style:'width:64px;'});
  const unitSel     = el('select',{});
  for(const u of UNITS){const o=el('option',{value:u},u);if((existing?.unit||'ml')===u)o.selected=true;unitSel.appendChild(o);}
  const customUnit  = el('input',{type:'text',placeholder:'Otra unidad',value:UNITS.includes(existing?.unit)?'':(existing?.unit||''),style:'flex:1;'});
  const peopleInput = el('input',{type:'number',min:'1',max:'20',value:existing?.peopleCount||1});
  const sizeInput   = el('input',{type:'number',min:'0',step:'1',placeholder:'Ej: 90, 200, 500',value:existing?.purchaseSize||''});
  const estInput    = el('input',{type:'number',min:'0',step:'0.01',placeholder:'Ej: 2.5',value:existing?.estimatedDailyPerPerson||''});
  const notesInput  = el('textarea',{placeholder:'Marca preferida, notas de compra…'},existing?.notes||'');
  const colorRow    = el('div',{style:'display:flex;gap:8px;flex-wrap:wrap;'});
  PALETTE.forEach(hex=>{
    const dot=el('div',{style:`width:28px;height:28px;border-radius:50%;background:${hex};cursor:pointer;border:3px solid ${hex===color?'var(--ink)':'transparent'};`});
    dot.addEventListener('click',()=>{color=hex;[...colorRow.children].forEach(d=>d.style.border='3px solid transparent');dot.style.border='3px solid var(--ink)';});
    colorRow.appendChild(dot);
  });
  const saveBtn = el('button',{class:'btn btn-primary'},isEdit?'Guardar cambios':'Crear suministro');
  saveBtn.addEventListener('click',()=>{
    const name=nameInput.value.trim();
    if(!name){toast('Poné un nombre.');return;}
    const unit=customUnit.value.trim()||unitSel.value;
    const patch={name,icon:iconInput.value.trim()||'🧴',unit,color,
      peopleCount:Math.max(1,Number(peopleInput.value)||1),
      purchaseSize:parseFloat(sizeInput.value)||null,
      estimatedDailyPerPerson:parseFloat(estInput.value)||null,
      notes:notesInput.value};
    if(isEdit){Store.updateSupply(existing.id,patch);toast('Actualizado');closeSheet();}
    else{
      const created=Store.createSupply(patch);
      toast('Suministro creado');closeSheet();
      setTimeout(()=>openNewBatch(Store.getSupply(created.id)),80);
    }
  });
  openSheet(el('div',{},[
    el('div',{class:'field'},[el('label',{},'Nombre'),nameInput]),
    el('div',{class:'row2'},[
      el('div',{class:'field'},[el('label',{},'Ícono'),iconInput]),
      el('div',{class:'field',style:'flex:3;'},[el('label',{},'Color'),colorRow]),
    ]),
    el('div',{class:'row2'},[
      el('div',{class:'field'},[el('label',{},'Unidad'),unitSel]),
      el('div',{class:'field'},[el('label',{},'Otra unidad'),customUnit]),
    ]),
    el('div',{class:'row2'},[
      el('div',{class:'field'},[el('label',{},'Personas'),peopleInput]),
      el('div',{class:'field'},[el('label',{},`Tamaño típico`),sizeInput]),
    ]),
    el('div',{class:'field'},[el('label',{},`Est. por persona/día`),estInput,
      el('div',{style:'font-size:11px;color:var(--ink-soft);margin-top:3px;'},'Se usa hasta que tengas historial de envases.')]),
    el('div',{class:'field'},[el('label',{},'Notas'),notesInput]),
    el('div',{class:'btn-row'},[saveBtn]),
  ]),{title:isEdit?'Editar suministro':'Nuevo suministro'});
}
