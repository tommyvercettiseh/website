const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const errors=[],virtualConsole=new VirtualConsole();
virtualConsole.on('jsdomError',error=>errors.push(error));
const dom=new JSDOM(fs.readFileSync('meals/index.html','utf8'),{
 url:'https://hesseldevries.com/meals/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,
 beforeParse(w){w.scrollTo=()=>{};w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};}
});
const w=dom.window,d=w.document;
async function test(){
 assert.equal(d.querySelectorAll('.meal-card').length,4);
 const initial=w.eval('dayTotals().k');
 d.querySelector('[data-quick="quark"]').click();
 assert(w.eval('dayTotals().k')>initial);
 assert(w.localStorage.length>0,'Meal must persist');
 d.getElementById('addFood').click();assert(d.getElementById('foodDialog').open);
 const search=d.getElementById('foodSearch');search.value='rijst';search.dispatchEvent(new w.Event('input'));
 assert(d.querySelector('[data-food="rice"]'));d.querySelector('[data-food="rice"]').click();
 assert(!d.getElementById('foodDialog').open);
 d.getElementById('addFood').click();search.value='8711111111111';
 w.fetch=async()=>({ok:true,json:async()=>({status:1,product:{code:'8711111111111',product_name:'Test product',nutriments:{'energy-kcal_100g':450,proteins_100g:5,carbohydrates_100g:60,fat_100g:20,fiber_100g:2}}})});
 d.getElementById('offSearch').click();await new Promise(resolve=>setTimeout(resolve,20));
 assert(d.querySelector('[data-food]'),'OFF lookup must render a product');
 assert.deepEqual(errors,[]);
 const htaccess=fs.readFileSync('.htaccess','utf8');
 assert(htaccess.includes('camera=(self)'),'Scanner camera must be allowed on same origin');
 process.stdout.write('PASS: diary boots, quick food, totals, persistence, product picker, OFF lookup and camera policy\n');
}
test().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1}).finally(()=>w.close());
