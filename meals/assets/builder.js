'use strict';
// HES Meals: editable recipes stored only in this browser.
const builderDialog=document.getElementById('builder-dialog');
const builderSlot=document.getElementById('builder-slot');
const builderFood=document.getElementById('builder-food');
let building=[],editingId=null;
builderSlot.innerHTML=slots.map(s=>'<option value="'+s.id+'">'+s.time+' · '+tidy(s.name)+'</option>').join('');
function builderFoodOptions(){
 const current=builderFood.value;
 builderFood.innerHTML=Object.entries(foods).sort((a,b)=>a[1].name.localeCompare(b[1].name,'nl')).map(([key,f])=>
 '<option value="'+tidy(key)+'">'+tidy(f.name)+'</option>').join('');
 if(foods[current])builderFood.value=current;
}
function builderTotals(){
 const sums={k:0,p:0,c:0,f:0,w:0};
 for(const it of building){
  const f=foods[it.key];if(!f)continue;
  for(const k of ['k','p','c','f'])sums[k]+=Number(it.g)*f[k]/100;
  sums.w+=Number(it.g)*f.w;
 }
 document.getElementById('builder-totals').textContent=
  format(sums.k)+' kcal · '+format(sums.p)+' g eiwit · '+format(sums.c)+' g KH · '+
  format(sums.f)+' g vet · circa '+format(sums.w)+' g bereid'+
  (builderSlot.value!=='shake'&&sums.w>500?' ⚠ boven de 500 g-grens':'');
}
function builderRows(){
 const list=document.getElementById('builder-items');
 list.innerHTML=building.length?building.map((it,i)=>{
  const f=foods[it.key];if(!f)return '';
  return '<div class="builder-line"><span><b>'+tidy(f.name)+'</b><small>'+
   format(it.g*f.k/100)+' kcal · '+(it.g*f.p/100).toFixed(1)+' g eiwit</small></span>'+
   '<span class="builder-qty"><input type="number" min="1" max="2500" step="1" value="'+it.g+
   '" data-builder-qty="'+i+'" aria-label="Gram '+tidy(f.name)+'">'+
   '<button type="button" data-builder-remove="'+i+'" aria-label="Verwijder '+tidy(f.name)+'">×</button></span></div>';
 }).join(''):'<div class="builder-empty">Voeg hieronder een ingrediënt toe, of zoek een product op barcode.</div>';
 builderTotals();
}
function builderOpen(slotId='lunch',recipe=null){
 if(recipe){
  editingId=recipe.id;
  building=recipe.items.map(it=>({key:it.key,g:Number(it.g)}));
  document.getElementById('builder-name').value=recipe.title;
  document.getElementById('builder-title').textContent='Bewerk jouw maaltijd';
 }else{
  editingId=null;building=[];
  document.getElementById('builder-name').value='';
  document.getElementById('builder-title').textContent='Maak je eigen maaltijd';
 }
 builderSlot.value=slotId;
 document.getElementById('builder-delete').hidden=!editingId;
 document.getElementById('builder-manual').hidden=true;
 builderFoodOptions();builderRows();
 if(!builderDialog.open)builderDialog.showModal();
}
function builderAdd(key,g){
 g=Number(g);
 if(!foods[key]||!Number.isFinite(g)||g<1||g>2500)return false;
 if(building.length>=30){toast('Maximaal 30 ingrediënten per recept');return false}
 building.push({key,g});builderRows();return true;
}
document.getElementById('open-builder').addEventListener('click',()=>builderOpen('lunch'));
document.getElementById('jump-search').addEventListener('click',()=>{
 document.getElementById('off-heading').scrollIntoView({behavior:'smooth',block:'start'});
 document.getElementById('off-query').focus({preventScroll:true});
});
document.getElementById('meals').addEventListener('click',e=>{
 const edit=e.target.closest('[data-builder-edit]'),newBtn=e.target.closest('[data-builder-new]');
 if(edit){const r=userRecipes.find(x=>x.id===edit.dataset.builderEdit);if(r)builderOpen(edit.closest('[data-slot]').dataset.slot,r)}
 else if(newBtn)builderOpen(newBtn.dataset.builderNew);
});
document.getElementById('builder-add').addEventListener('click',()=>builderAdd(builderFood.value,document.getElementById('builder-grams').value));
document.getElementById('builder-slot').addEventListener('change',builderTotals);
document.getElementById('builder-items').addEventListener('input',e=>{
 const el=e.target.closest('[data-builder-qty]');if(!el)return;
 const i=Number(el.dataset.builderQty),g=Number(el.value);
 if(!building[i]||!Number.isFinite(g)||g<1||g>2500)return;
 building[i].g=g;
 const f=foods[building[i].key];
 el.closest('.builder-line').querySelector('small').textContent=format(g*f.k/100)+' kcal · '+(g*f.p/100).toFixed(1)+' g eiwit';
 builderTotals();
});
document.getElementById('builder-items').addEventListener('change',builderRows);
document.getElementById('builder-items').addEventListener('click',e=>{
 const b=e.target.closest('[data-builder-remove]');if(!b)return;
 building.splice(Number(b.dataset.builderRemove),1);builderRows();
});
document.getElementById('builder-manual-toggle').addEventListener('click',()=>{
 const el=document.getElementById('builder-manual');el.hidden=!el.hidden;
});
document.getElementById('builder-manual-add').addEventListener('click',()=>{
 const name=document.getElementById('builder-manual-name').value.trim().slice(0,80);
 const get=id=>Number(document.getElementById(id).value);
 const g=get('builder-manual-g'),k=get('builder-manual-k'),p=get('builder-manual-p'),c=get('builder-manual-c'),f=get('builder-manual-f');
 if(name.length<2||[g,k,p,c,f].some(x=>!Number.isFinite(x)||x<0)||g<1||g>2500||k>1000||p>100||c>100||f>100){
  toast('Vul voedingswaarden per 100 g in');return;
 }
 const key='manual-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
 customFoods[key]={name,k,p,c,f,w:1,unit:'g'};foods[key]=customFoods[key];
 persist();builderFoodOptions();builderAdd(key,g);
 document.getElementById('builder-manual').hidden=true;
 document.getElementById('builder-manual-name').value='';
});
document.getElementById('builder-form').addEventListener('submit',e=>{
 e.preventDefault();
 const title=document.getElementById('builder-name').value.trim(),slot=builderSlot.value;
 if(title.length<2||title.length>70||!building.length||!slots.some(x=>x.id===slot)||
  building.some(x=>!foods[x.key]||!Number.isFinite(x.g)||x.g<=0||x.g>2500)){
  toast('Vul een naam en geldige ingrediënten in');return;
 }
 if(!editingId&&userRecipes.length>=50){toast('Maximaal 50 eigen recepten');return}
 const id=editingId||('mine-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7));
 const recipe={id,title,desc:'Zelf samengesteld · opgeslagen op dit apparaat',emoji:'🍽️',custom:true,art:0,items:building.map(x=>({key:x.key,g:x.g}))};
 if(editingId){
  const i=userRecipes.findIndex(x=>x.id===editingId);if(i<0)return;userRecipes[i]=recipe;
 }else userRecipes.push(recipe);
 plan[day]??={};plan[day][slot]=id;
 for(const key of Object.keys(amounts))if(key.includes('|'+id+'|'))delete amounts[key];
 persist();editingId=null;building=[];builderDialog.close();render();toast('Maaltijd opgeslagen ✓');
});
document.getElementById('builder-delete').addEventListener('click',()=>{
 if(!editingId)return;const id=editingId;
 userRecipes=userRecipes.filter(x=>x.id!==id);
 for(const chosen of Object.values(plan)){
  if(chosen&&typeof chosen==='object')for(const k of Object.keys(chosen))if(chosen[k]===id)delete chosen[k];
 }
 for(const k of Object.keys(amounts))if(k.includes('|'+id+'|'))delete amounts[k];
 persist();editingId=null;building=[];builderDialog.close();render();toast('Maaltijd verwijderd');
});
for(const id of ['builder-close','builder-cancel']){
 document.getElementById(id).addEventListener('click',()=>{editingId=null;building=[];builderDialog.close()});
}
document.getElementById('builder-search-off').addEventListener('click',()=>{
 builderDialog.close();document.getElementById('off-heading').scrollIntoView({behavior:'smooth',block:'start'});
 document.getElementById('off-query').focus({preventScroll:true});
});
document.getElementById('off-to-builder').addEventListener('click',()=>{
 if(!offPicked)return;
 const p=offPicked,code='off-'+p.code;
 if(!building.length&&!editingId)builderOpen(document.getElementById('off-slot').value);
 else if(!builderDialog.open)builderDialog.showModal();
 customFoods[code]={name:(p.brand?p.brand+' ':'')+p.name,k:p.k,p:p.p,c:p.c,f:p.f,w:1,unit:'g'};
 foods[code]=customFoods[code];
 const g=Number(document.getElementById('off-grams').value);
 builderFoodOptions();if(builderAdd(code,g))persist();
});
