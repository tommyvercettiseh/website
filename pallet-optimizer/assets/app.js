const form=document.getElementById('calculatorForm');
const submitButton=form.querySelector("button[type='submit']");
const resultCard=document.getElementById('resultCard');
const downloadButton=document.getElementById('downloadResult');
const nf=new Intl.NumberFormat('en-US');
let latestResult=null,heightMode='inclusive',palletMode='preset';

function num(id){
  const v=Number(document.getElementById(id).value);
  if(!Number.isFinite(v)||v<=0)throw new Error('Enter valid values greater than 0.');
  return v;
}

function reference(){
  return (document.getElementById('reference')?.value||'').trim();
}

function safeName(value){
  return value.toLowerCase().replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,60);
}

function palletHeight(){
  if(palletMode==='custom')return num('custom_pallet_height_mm');
  return PalletOptimizer.PALLETS[document.getElementById('pallet_id').value].height_mm;
}

function payload(){
  const ph=palletHeight(),entered=num('max_total_height_mm');
  return{
    pallet_id:palletMode==='custom'?'custom':document.getElementById('pallet_id').value,
    custom_pallet_length_mm:palletMode==='custom'?num('custom_pallet_length_mm'):0,
    custom_pallet_width_mm:palletMode==='custom'?num('custom_pallet_width_mm'):0,
    custom_pallet_height_mm:palletMode==='custom'?ph:0,
    box_length_mm:num('box_length_mm'),
    box_width_mm:num('box_width_mm'),
    box_height_mm:num('box_height_mm'),
    max_total_height_mm:heightMode==='inclusive'?entered:entered+ph
  };
}

function text(id,value){const el=document.getElementById(id);if(el)el.textContent=value}

function applyReleaseUi(){
  const brandText=document.querySelector('.brand>span:last-child');
  if(brandText&&!brandText.querySelector('.latest-update')){
    const badge=document.createElement('small');
    badge.className='latest-update';
    badge.textContent='HESSEL / PROJECTS';
    brandText.appendChild(badge);
  }
  const palletQty=document.getElementById('palletQuantity');
  if(palletQty&&palletQty.previousElementSibling)palletQty.previousElementSibling.textContent='Items / pallet';
  const style=document.createElement('style');
  style.textContent='.latest-update{display:inline-flex;align-items:center;width:max-content;margin-top:1px;padding:2px 7px;border-radius:999px;background:rgba(100,116,139,.30);color:#475569;font-size:9px!important;font-weight:750;line-height:1.35;letter-spacing:.01em;white-space:nowrap}@media(max-width:680px){.latest-update{display:none}}';
  document.head.appendChild(style);
}

function setPalletMode(mode){
  palletMode=mode;
  document.querySelectorAll('[data-pallet-mode]').forEach(b=>b.classList.toggle('active',b.dataset.palletMode===mode));
  document.getElementById('presetPalletField').hidden=mode==='custom';
  document.getElementById('customPalletFields').hidden=mode!=='custom';
}

function setHeightMode(mode){
  if(mode===heightMode)return;
  const input=document.getElementById('max_total_height_mm'),ph=palletHeight(),value=Number(input.value)||0;
  input.value=mode==='exclusive'?Math.max(value-ph,1):value+ph;
  heightMode=mode;
  document.querySelectorAll('[data-height-mode]').forEach(b=>b.classList.toggle('active',b.dataset.heightMode===mode));
  document.getElementById('heightLabel').textContent=mode==='inclusive'?'Maximum total pallet height':'Maximum load height';
}

function calculate({scroll=true}={}){
  const error=document.getElementById('formError');
  error.hidden=true;
  submitButton.disabled=true;
  submitButton.textContent='Calculating…';
  try{
    latestResult=PalletOptimizer.calculate(payload());
    update(latestResult);
    downloadButton.disabled=false;
    if(scroll&&matchMedia('(max-width:1120px)').matches)resultCard.scrollIntoView({behavior:'smooth'});
  }catch(e){
    error.textContent=e.message||'Something went wrong.';
    error.hidden=false;
  }finally{
    submitButton.disabled=false;
    submitButton.textContent='▦ Calculate pallet';
  }
}

function update(data){
  const cq=num('case_quantity'),load=Math.max(data.load_height_mm-data.pallet.height_mm,0);
  text('boxesPerLayer',nf.format(data.boxes_per_layer));
  text('layers',nf.format(data.layers));
  text('boxesPerPallet',nf.format(data.boxes_per_pallet));
  text('palletQuantity',nf.format(data.boxes_per_pallet*cq));
  text('totalHeight',`${data.load_height_mm} mm`);
  text('palletHeight',`${data.pallet.height_mm} mm`);
  text('loadHeight',`${load} mm`);
  text('heightSummaryTotal',`${data.load_height_mm} mm`);
  text('resultSubtitle',`${data.pallet.name} · ${data.pallet.length_mm} × ${data.pallet.width_mm} × ${data.pallet.height_mm} mm`);
  text('solverStatus',data.optimality_proven?'Optimized':'Best found');
  const a=data.advice.minimum_reduction_for_gain;
  text('heightAdviceText',a?`Tip: reduce carton height by ${a.reduction_mm} mm for ${a.new_layers} layers`:'Tip: no practical height reduction found for an extra layer');
  draw(data);
}

function prep(canvas){
  const r=canvas.getBoundingClientRect(),w=Math.max(r.width,300),h=Math.max(r.height,260),ratio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
  const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
  return{ctx,w,h};
}

function poly(ctx,pts,fill,stroke='rgba(84,55,29,.48)'){
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=.75;ctx.stroke();
}

function draw(data){
  const canvas=document.getElementById('palletCanvas'),{ctx,w,h}=prep(canvas),p=data.pallet,total=Math.max(data.load_height_mm,p.height_mm+data.input.box_height_mm),raw=(x,y,z)=>({x:x-y,y:-(x+y)*.34-z*.62}),bounds=[];
  [0,p.length_mm].forEach(x=>[0,p.width_mm].forEach(y=>[0,total].forEach(z=>bounds.push(raw(x,y,z)))));
  const minX=Math.min(...bounds.map(q=>q.x)),maxX=Math.max(...bounds.map(q=>q.x)),minY=Math.min(...bounds.map(q=>q.y)),maxY=Math.max(...bounds.map(q=>q.y)),scale=Math.min((w-70)/(maxX-minX),(h-30)/(maxY-minY)),origin={x:35+(w-70-(maxX-minX)*scale)/2-minX*scale,y:15+(h-30-(maxY-minY)*scale)/2-minY*scale},pr=(x,y,z)=>{const q=raw(x,y,z);return{x:origin.x+q.x*scale,y:origin.y+q.y*scale}};
  function cube(x,y,z,l,d,bh,c){
    const a=pr(x,y,z),b=pr(x+l,y,z),dd=pr(x,y+d,z),at=pr(x,y,z+bh),bt=pr(x+l,y,z+bh),ct=pr(x+l,y+d,z+bh),dt=pr(x,y+d,z+bh);
    poly(ctx,[a,dd,dt,at],c.left);poly(ctx,[a,b,bt,at],c.right);poly(ctx,[at,bt,ct,dt],c.top);
  }
  ctx.strokeStyle='rgba(224,163,99,.13)';
  for(let i=-4;i<=4;i++){let a=pr(i*230,-450,0),b=pr(i*230,1300,0);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
  cube(0,0,0,p.length_mm,p.width_mm,p.height_mm,{top:'#d5a468',left:'#9b6536',right:'#b97d45'});
  const sorted=[...data.layout].sort((a,b)=>(b.x_mm+b.y_mm)-(a.x_mm+a.y_mm));
  for(let layer=0;layer<data.layers;layer++){
    const z=p.height_mm+layer*data.input.box_height_mm;
    sorted.forEach(box=>cube(box.x_mm,box.y_mm,z,box.length_mm,box.width_mm,data.input.box_height_mm,{top:box.rotated?'#dfaa78':'#e8b67f',left:box.rotated?'#915334':'#a4603d',right:box.rotated?'#70412e':'#8e5033'}));
  }
}

function roundRect(ctx,x,y,w,h,r,fill,stroke){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}
}

function drawContained(ctx,source,x,y,maxWidth,maxHeight){
  const sourceWidth=source.width||1,sourceHeight=source.height||1;
  const scale=Math.min(maxWidth/sourceWidth,maxHeight/sourceHeight);
  const width=sourceWidth*scale,height=sourceHeight*scale;
  ctx.drawImage(source,x+(maxWidth-width)/2,y+(maxHeight-height)/2,width,height);
}

function download(){
  if(!latestResult)return;
  const src=document.getElementById('palletCanvas'),c=document.createElement('canvas');
  c.width=1700;c.height=1320;
  const x=c.getContext('2d');
  const ref=reference()||'No reference';
  const carton=`${num('box_length_mm')} × ${num('box_width_mm')} × ${num('box_height_mm')} mm`;
  const caseQty=num('case_quantity');
  const itemsPerPallet=latestResult.boxes_per_pallet*caseQty;
  const loadHeight=Math.max(latestResult.load_height_mm-latestResult.pallet.height_mm,0);
  const enteredHeight=num('max_total_height_mm');
  const maxHeightLabel=heightMode==='inclusive'?'Max height incl. pallet':'Max load height excl. pallet';

  x.fillStyle='#f6f8fc';x.fillRect(0,0,c.width,c.height);
  x.fillStyle='#171d20';x.fillRect(0,0,c.width,112);
  x.fillStyle='#e8b67f';x.font='800 36px Arial';x.fillText('Pallet Optimizer · Result',58,55);
  x.font='700 22px Arial';x.fillText(ref,58,88);

  x.fillStyle='#64748b';x.font='600 18px Arial';
  x.fillText(`${latestResult.pallet.name} · ${latestResult.pallet.length_mm} × ${latestResult.pallet.width_mm} × ${latestResult.pallet.height_mm} mm`,58,148);

  const items=[
    ['Reference',ref],
    ['Carton L × W × H',carton],
    ['Case quantity',nf.format(caseQty)],
    [maxHeightLabel,`${enteredHeight} mm`],
    ['Boxes / layer',nf.format(latestResult.boxes_per_layer)],
    ['Layers',nf.format(latestResult.layers)],
    ['Boxes / pallet',nf.format(latestResult.boxes_per_pallet)],
    ['Items / pallet',nf.format(itemsPerPallet)],
    ['Pallet height',`${latestResult.pallet.height_mm} mm`],
    ['Load height',`${loadHeight} mm`],
    ['Total height',`${latestResult.load_height_mm} mm`],
    ['Layout status',latestResult.optimality_proven?'Optimized':'Best found']
  ];

  const startX=58,startY=180,cardW=380,cardH=86,gapX=18,gapY=14;
  items.forEach((item,i)=>{
    const px=startX+(i%4)*(cardW+gapX),py=startY+Math.floor(i/4)*(cardH+gapY);
    roundRect(x,px,py,cardW,cardH,14,'#ffffff','#dbe3ef');
    x.fillStyle='#64748b';x.font='700 14px Arial';x.fillText(item[0],px+16,py+26);
    x.fillStyle='#0f172a';x.font='800 20px Arial';
    let value=String(item[1]);if(value.length>32)value=value.slice(0,30)+'…';
    x.fillText(value,px+16,py+58);
  });

  const advice=latestResult.advice.minimum_reduction_for_gain;
  roundRect(x,58,495,1584,60,18,'#fff7e8','#f2ad5c');
  x.fillStyle='#ea7a16';x.beginPath();x.arc(88,525,16,0,Math.PI*2);x.fill();
  x.fillStyle='#fff';x.font='800 18px Arial';x.fillText('i',84,531);
  x.fillStyle='#7a3c05';x.font='800 18px Arial';
  x.fillText(advice?`Tip: reduce carton height by ${advice.reduction_mm} mm to reach ${advice.new_layers} layers.`:'Tip: no practical height reduction found for an extra layer.',116,532);

  drawContained(x,src,120,590,1460,650);
  x.fillStyle='#64748b';x.font='600 16px Arial';
  x.fillText(`Generated by Pallet Optimizer · ${latestResult.boxes_per_layer} boxes/layer · ${latestResult.layers} layers · ${latestResult.boxes_per_pallet} boxes/pallet · ${itemsPerPallet} items/pallet`,58,1282);

  c.toBlob(blob=>{
    const u=URL.createObjectURL(blob),a=document.createElement('a');
    const refPart=safeName(reference());
    const sizePart=`${num('box_length_mm')}x${num('box_width_mm')}x${num('box_height_mm')}mm`;
    a.href=u;
    a.download=refPart?`${sizePart}_${refPart}.png`:`${sizePart}.png`;
    a.click();
    URL.revokeObjectURL(u);
  },'image/png');
}

document.querySelectorAll('[data-pallet-mode]').forEach(b=>b.onclick=()=>setPalletMode(b.dataset.palletMode));
document.querySelectorAll('[data-height-mode]').forEach(b=>b.onclick=()=>setHeightMode(b.dataset.heightMode));
form.onsubmit=e=>{e.preventDefault();calculate()};
downloadButton.onclick=download;
addEventListener('resize',()=>latestResult&&draw(latestResult));
if('serviceWorker'in navigator)navigator.serviceWorker.register('service-worker.js').catch(()=>{});
applyReleaseUi();
calculate({scroll:false});
