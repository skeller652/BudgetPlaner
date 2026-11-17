(function(root){
'use strict';
const VERSION='6.0.0';
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2);
const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const dateStr=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function parseDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw Error('Ungültiges Datum');const [y,m,d]=s.split('-').map(Number),v=new Date(y,m-1,d,12);if(dateStr(v)!==s)throw Error('Ungültiges Datum');return v;}
const keyDate=d=>dateStr(new Date(d.getFullYear(),d.getMonth()+(d.getDate()>=25?1:0),1,12)).slice(0,7);
const key=s=>keyDate(parseDate(s));
const nowKey=()=>keyDate(new Date());
function bounds(k){const [y,m]=k.split('-').map(Number);return{start:dateStr(new Date(y,m-2,25,12)),end:dateStr(new Date(y,m-1,24,12))};}
function shift(k,n){const [y,m]=k.split('-').map(Number);return dateStr(new Date(y,m-1+n,1,12)).slice(0,7);}
const title=k=>MONTHS[Number(k.slice(5))-1]+' '+k.slice(0,4);
const format=s=>new Intl.DateTimeFormat('de-CH').format(parseDate(s));
const range=k=>{const b=bounds(k);return format(b.start)+' – '+format(b.end);};
const clone=x=>JSON.parse(JSON.stringify(x));
function empty(){return{schema:6,revision:0,categories:['Lebensmittel','Restaurant & Freizeit','Haushalt','Gesundheit','Kleidung','Mobilität','Reisen','Hobby','Geschenke','Sonstiges'].map(name=>({id:uid(),name,color:'#2563eb',hidden:false})),plans:[],entries:[],refunds:[],reserveMoves:[],billPayments:[],goals:[],closed:{},settings:{pinHash:'',lastBackup:'',backupSince:new Date().toISOString(),lastCategory:''}};}
function migrate(old){
 const s=empty(),category=name=>{let c=s.categories.find(x=>x.name===name);if(!c){c={id:uid(),name:name||'Sonstiges',color:'#2563eb',hidden:false};s.categories.push(c);}return c.id;};
 for(const [list,type]of [['fixedIncomes','income'],['monthlyFixedCosts','monthly'],['annualFixedCosts','annual']])for(const x of old[list]||[]){
 s.plans.push({id:x.id||uid(),type,versions:[{from:'1900-01',description:String(x.description||'Eintrag'),amount:round(x.annualAmount??x.amount??0),category:category(x.category||'Sonstiges'),note:String(x.note||''),dueMonth:Number(x.dueMonth)||1,dueDay:1,active:true}],overrides:{},legacyPaidYears:x.paidYears||[]});}
 for(const [list,type]of [['expenses','expense'],['extraIncomes','extra']])for(const x of old[list]||[])s.entries.push({id:x.id||uid(),type,date:x.date,description:String(x.description||'Eintrag'),amount:round(x.amount||0),category:category(x.category||'Sonstiges'),note:String(x.note||'')});
 for(const [name,budget]of Object.entries(old.categoryBudgets||{})){const id=category(name);s.categories.find(x=>x.id===id).budget=round(budget||0);}
 s.goals=(old.savingGoals||[]).map(x=>({id:x.id||uid(),name:String(x.name||'Sparziel'),target:round(x.target||0),current:round(x.current||0),deadline:x.deadline||''}));
 s.settings.pinHash=old.settings?.pinHash||'';s.migratedAt=new Date().toISOString();s.migrationNote='Historische Fixkosten mangels Gültigkeitsdatum unverändert übernommen. Alte Bezahlt-Markierungen sind Hinweise, keine Zahlungen. Fälligkeitstag bei alten Jahreskosten zunächst 1: bitte prüfen.';return s;
}
function effective(plan,k){if(plan.overrides[k])return clone(plan.overrides[k]);return clone(plan.versions.filter(v=>v.from<=k).sort((a,b)=>a.from.localeCompare(b.from)).at(-1)||null);}
function plansAt(s,k){return s.plans.map(p=>{const v=effective(p,k);return v&&v.active?{...v,id:p.id,type:p.type,override:Boolean(p.overrides[k]),legacyPaidYears:p.legacyPaidYears||[]}:null;}).filter(Boolean);}
function total(xs){return round(xs.reduce((a,b)=>a+Number(b.amount),0));}
function metrics(s,k,live=false){
 if(!live&&s.closed[k])return clone(s.closed[k].metrics);
 const ps=plansAt(s,k),entries=s.entries.filter(e=>key(e.date)===k),refunds=s.refunds.filter(e=>key(e.date)===k);
 const income=round(total(ps.filter(p=>p.type==='income'))+total(entries.filter(e=>e.type==='extra'))),monthly=total(ps.filter(p=>p.type==='monthly')),reserve=round(total(ps.filter(p=>p.type==='annual'))/12),gross=total(entries.filter(e=>e.type==='expense')),refunded=total(refunds),variable=round(gross-refunded);
 const categories={};for(const c of s.categories){const spent=round(total(entries.filter(e=>e.type==='expense'&&e.category===c.id))-total(refunds.filter(e=>e.category===c.id)));categories[c.id]={name:c.name,color:c.color,budget:c.budget||0,spent};}
 const payments=total(s.billPayments.filter(e=>key(e.date)===k));
 return{income,monthly,reserve,gross,refunded,variable,remaining:round(income-monthly-reserve-variable),budget:round(s.categories.reduce((a,c)=>a+(c.budget||0),0)),payments,categories};
}
function guarded(s,k){if(s.closed[k])throw Error('Dieser Budgetmonat ist abgeschlossen. Zuerst wieder öffnen.');}
function planChange(s,id,v,scope,k){
 guarded(s,k);const p=s.plans.find(p=>p.id===id);if(!p)throw Error('Vorlage fehlt');
 if(scope==='one'){p.overrides[k]=clone(v);return;}
 if(Object.keys(s.closed).some(c=>c>=k))throw Error('Die Änderung würde einen abgeschlossenen Monat betreffen. Wähle einen späteren Gültigkeitsmonat oder öffne den betreffenden Abschluss.');
 p.versions=p.versions.filter(x=>x.from!==k);p.versions.push({...clone(v),from:k});
}
function refundAvailable(s,id,exclude=''){const e=s.entries.find(e=>e.id===id&&e.type==='expense');if(!e)throw Error('Ausgabe fehlt');return round(e.amount-total(s.refunds.filter(r=>r.expenseId===id&&r.id!==exclude)));}
function closeMonth(s,k){guarded(s,k);if(k>=nowKey())throw Error('Nur vergangene Budgetmonate können abgeschlossen werden.');s.closed[k]={at:new Date().toISOString(),metrics:metrics(s,k,true)};}
function reserveBalance(s,planId,through='9999-12-31'){return round(total(s.reserveMoves.filter(x=>x.planId===planId&&x.date<=through))-total(s.billPayments.filter(x=>x.planId===planId&&x.date<=through)));}
function dueDate(p,year){const last=new Date(year,p.dueMonth,0).getDate();return dateStr(new Date(year,p.dueMonth-1,Math.min(p.dueDay,last),12));}
function validate(s){
 if(!s||s.schema!==6)throw Error('Keine V6-Sicherung');
 for(const field of ['categories','plans','entries','refunds','reserveMoves','billPayments','goals'])if(!Array.isArray(s[field]))throw Error('Fehlende Liste: '+field);
 const amount=x=>{if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>1e10)throw Error('Ungültiger Betrag');};
 const text=x=>{if(typeof x!=='string'||x.length>10000)throw Error('Ungültiger Text');};
 const ids=new Set();for(const list of ['categories','plans','entries','refunds','reserveMoves','billPayments','goals'])for(const x of s[list]){text(x.id);if(ids.has(x.id))throw Error('Doppelte ID');ids.add(x.id);}
 const cats=new Set(s.categories.map(c=>c.id)),plans=new Set(s.plans.map(p=>p.id));
 for(const c of s.categories){text(c.name);if(!/^#[0-9a-f]{6}$/i.test(c.color))throw Error('Ungültige Farbe');if(c.budget!=null)amount(c.budget);}
 const ver=v=>{text(v.description);text(v.note||'');amount(v.amount);if(!cats.has(v.category))throw Error('Kategorie fehlt');if(typeof v.active!=='boolean')throw Error('Status fehlt');if(!Number.isInteger(v.dueMonth)||v.dueMonth<1||v.dueMonth>12||!Number.isInteger(v.dueDay)||v.dueDay<1||v.dueDay>31)throw Error('Fälligkeit ungültig');};
 const period=k=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(k))throw Error('Budgetmonat ungültig');};
 for(const p of s.plans){if(!['income','monthly','annual'].includes(p.type)||!Array.isArray(p.versions)||!p.overrides||typeof p.overrides!=='object')throw Error('Vorlage ungültig');for(const v of p.versions){period(v.from);ver(v);}for(const [k,v]of Object.entries(p.overrides)){period(k);ver(v);}}
 for(const e of s.entries){if(!['expense','extra'].includes(e.type))throw Error('Buchungsart ungültig');parseDate(e.date);amount(e.amount);text(e.description);text(e.note||'');if(!cats.has(e.category))throw Error('Kategorie fehlt');}
 for(const r of s.refunds){parseDate(r.date);amount(r.amount);text(r.description);const e=s.entries.find(x=>x.id===r.expenseId&&x.type==='expense');if(!e||r.category!==e.category||refundAvailable(s,e.id)<0)throw Error('Rückerstattung ungültig');}
 for(const list of ['reserveMoves','billPayments'])for(const e of s[list]){parseDate(e.date);amount(e.amount);text(e.note||'');if(!plans.has(e.planId)||s.plans.find(p=>p.id===e.planId).type!=='annual')throw Error('Jahresvorlage fehlt');if(list==='billPayments'&&(!Number.isInteger(e.billYear)||e.billYear<1900||e.billYear>2200))throw Error('Rechnungsjahr ungültig');}
 for(const g of s.goals){text(g.name);amount(g.target);amount(g.current);if(g.deadline)parseDate(g.deadline);}
 if(!s.closed||typeof s.closed!=='object'||Array.isArray(s.closed)||!s.settings||typeof s.settings!=='object')throw Error('Einstellungen/Abschlüsse fehlen');
 if(s.settings.pinHash&&!/^[a-f0-9]{64}$/.test(s.settings.pinHash))throw Error('PIN-Hash ungültig');
 for(const f of ['lastBackup','backupSince'])if(s.settings[f]&&(typeof s.settings[f]!=='string'||!Number.isFinite(Date.parse(s.settings[f]))))throw Error('Sicherungsdatum ungültig');
 for(const [k,c]of Object.entries(s.closed)){period(k);if(!c.metrics||!c.metrics.categories)throw Error('Abschluss ungültig');for(const f of ['income','monthly','reserve','gross','refunded','variable','remaining','budget','payments'])if(typeof c.metrics[f]!=='number'||!Number.isFinite(c.metrics[f]))throw Error('Abschlusswerte ungültig');for(const v of Object.values(c.metrics.categories)){text(v.name);amount(v.budget);if(!Number.isFinite(v.spent)||!/^#[0-9a-f]{6}$/i.test(v.color))throw Error('Abschlusskategorie ungültig');}}
 return s;
}
const api={VERSION,MONTHS,uid,round,dateStr,parseDate,key,keyDate,nowKey,bounds,shift,title,format,range,clone,empty,migrate,effective,plansAt,total,metrics,guarded,planChange,refundAvailable,closeMonth,reserveBalance,dueDate,validate};
if(typeof module!=='undefined')module.exports=api;else root.Budget=api;
})(globalThis);
