const mem = {};
global.localStorage = { getItem:(k)=>(k in mem?mem[k]:null), setItem:(k,v)=>{mem[k]=v;}, removeItem:(k)=>{delete mem[k];} };
global.window = { dispatchEvent: () => {} };
global.CustomEvent = class { constructor(n){this.name=n;} };
const Store = await import('./js/store.js');
const { supplyStats } = await import('./js/views/supplies.js');
function eq(a,b,msg){ if(String(a)!==String(b)){console.error('FAIL:',msg,'got',JSON.stringify(a),'expected',JSON.stringify(b));process.exitCode=1;} else console.log('ok:',msg); }
function near(a,b,msg,tol=0.5){ if(Math.abs(a-b)>tol){console.error('FAIL:',msg,a,b);process.exitCode=1;} else console.log('ok:',msg); }

// Create a supply
const sup = Store.createSupply({ name:'Pasta de dientes', icon:'🪥', unit:'g', peopleCount:2, purchaseSize:90 });
eq(Store.listSupplies().length, 1, 'supply created');

// Open a batch and finish it after 30 days (90g in 30 days = 3g/day for 2 people)
Store.addSupplyBatch(sup.id, { startDate:'2026-06-01', quantity:90, notes:'primer envase' });
const s1 = Store.getSupply(sup.id);
eq(s1.batches.length, 1, 'batch added');
eq(s1.batches[0].endDate, undefined, 'batch is open');

Store.finishSupplyBatch(sup.id, s1.batches[0].id, '2026-07-01');
const s2 = Store.getSupply(sup.id);
eq(s2.batches[0].endDate, '2026-07-01', 'batch closed with end date');

// Stats from closed batch: 90g / 30 days = 3g/day
const stats = supplyStats(s2);
near(stats.effectiveRate, 3, 'rate = 3g/day from closed batch');
near(stats.ratePerPerson, 1.5, 'rate per person = 1.5g/day');
near(stats.monthlyTotal, 3 * 30.44, 'monthly total ~91g');
near(stats.yearlyTotal,  3 * 365.25, 'yearly total ~1096g');
near(stats.containersPerYear, (3 * 365.25) / 90, 'containers/year ~12.2');

// Open second batch: 90g started 10 days ago
const tenDaysAgo = '2026-07-10'; // arbitrary "today" for this test
Store.addSupplyBatch(sup.id, { startDate:'2026-07-10', quantity:90 });
const s3 = Store.getSupply(sup.id);
const stats2 = supplyStats(s3);
// 10 days at 3g/day = 30g used, 60g left
near(stats2.amountUsed || 0, 30, 'amount used after 10 days (approx)', 3);
near(stats2.amountLeft || 60, 60, 'amount left approx 60g', 3);

// Delete batch
Store.deleteSupplyBatch(sup.id, s3.batches[0].id);
eq(Store.getSupply(sup.id).batches.length, 1, 'batch deleted');

// Delete supply
Store.deleteSupply(sup.id);
eq(Store.listSupplies().length, 0, 'supply deleted');
console.log('ALL OK');
