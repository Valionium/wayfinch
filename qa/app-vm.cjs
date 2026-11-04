// Source-level test harness only. It does not load or render the local app in a browser.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
// A shared browser store: several app VMs can sit on one store, as two tabs of one browser do.
// A write by one VM fires a 'storage' event in every other VM on the same store, as browsers do.
function sharedStore(){return {values:new Map(),vms:new Set()};}
function appVM(options={}){
  const store=options.storage||sharedStore();
  const html=fs.readFileSync(options.page||require('./paths.cjs').page,'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const nodes=new Map(),events=new Map(),listeners={};
  const values=store.values;
  const element=id=>({id,innerHTML:'',textContent:'',value:'',dataset:{},style:{},children:[],attributes:[],
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},querySelectorAll(){return [];},querySelector(){return null;},
    addEventListener(){},removeEventListener(){},setAttribute(){},getAttribute(){return null;},removeAttribute(){},
    hasAttribute(){return false;},contains(){return false;},focus(){},scrollIntoView(){},closest(){return null;},
    insertAdjacentHTML(where,html){this.innerHTML+=html;}});
  const get=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
  const notify=(key,oldValue,newValue)=>{
    store.vms.forEach(other=>{if(other!==self)other.fireStorage(key,oldValue,newValue);});
  };
  const localStorage={getItem:key=>values.get(key)??null,
    setItem(key,value){const old=values.get(key)??null;values.set(key,String(value));notify(key,old,String(value));},
    removeItem(key){const old=values.get(key)??null;values.delete(key);notify(key,old,null);}};
  const on=(type,callback)=>{events.set(type,callback);(listeners[type]=listeners[type]||[]).push(callback);};
  const window={localStorage,addEventListener:on,location:{reload(){throw Error('Unexpected reload');}},scrollTo(){}};
  const document={getElementById:get,querySelectorAll(){return [];},querySelector(){return null;},addEventListener:on,
    body:element('body'),documentElement:element('html'),activeElement:null};
  const context=vm.createContext({console,window,document,navigator:{onLine:true},location:{href:'https://example.test/index.html',protocol:'https:'},
    setTimeout,clearTimeout,URL,Blob,TextEncoder,AbortController,Response,Request,Headers,MessageChannel,
    fetch(){throw Error('Network requests are disabled in this test');}});
  // The bike module the page loads before its own script (/tools/bags/bike.js), built from src/core/bike as the build does.
  if(options.bike!==false)vm.runInContext(require('../tools/bike-script.cjs').bikeScriptSync(),context,{filename:'bike.js'});
  vm.runInContext(script.slice(0,script.indexOf('/* ==== 95-init.js ==== */')),context,{filename:'index.html'});
  const run=code=>vm.runInContext(code,context);
  // Rendering is tested separately through the markup-producing functions.
  run('renderResult=()=>{};renderRecall=()=>{};renderPackingSaveStatus=()=>{};renderOfflinePackingStatus=()=>{};');
  // Calls every listener this page registered for a storage event.
  const fireStorage=(key,oldValue,newValue)=>(listeners.storage||[]).forEach(cb=>cb({type:'storage',key,oldValue,newValue,storageArea:localStorage}));
  const self={context,run,nodes,values,events,listeners,html,script,store,fireStorage,localStorage};
  store.vms.add(self);
  return self;
}
module.exports={appVM,sharedStore};
