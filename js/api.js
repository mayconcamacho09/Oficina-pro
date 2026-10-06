/* OFICINA PRO v9 - API centralizada + cache local */
(function(){
  const API='/api';
  const native={get:localStorage.getItem.bind(localStorage),set:localStorage.setItem.bind(localStorage),remove:localStorage.removeItem.bind(localStorage)};
  const keys=['usuarios','clientes','veiculos','ordens','estoque','agenda','pagamentos','despesas'];
  async function request(path,opts={}){
    const token=native.get('apiToken');
    const headers={'Content-Type':'application/json',...(opts.headers||{})};
    if(token) headers.Authorization='Bearer '+token;
    const r=await fetch(API+path,{...opts,headers});
    let d={}; try{d=await r.json();}catch{}
    if(!r.ok) throw new Error(d.error||d.message||'Erro de comunicação com o servidor.');
    return d;
  }
  function setLocal(key,data){native.set(key,JSON.stringify(data));}
  window.oficinaAPI={
    async login(usuario,senha){
      const d=await request('/auth/login',{method:'POST',body:JSON.stringify({username:usuario,password:senha})});
      native.set('apiToken',d.token); native.set('usuarioLogado','true'); native.set('nomeUsuarioLogado',d.user.nome); native.set('perfilUsuarioLogado',d.user.perfil); native.set('loginUsuarioLogado',d.user.usuario); return d.user;
    },
    async sync(){
      const token=native.get('apiToken'); if(!token) return false;
      try{const d=await request('/state'); Object.keys(d.state||{}).forEach(k=>{if(Array.isArray(d.state[k]))setLocal(k,d.state[k]);}); return true;}catch(e){console.warn('Servidor indisponível; mantendo cache local.',e.message); return false;}
    },
    async saveCollection(key,data){ return request('/data/'+encodeURIComponent(key),{method:'PUT',body:JSON.stringify({records:data})}); },
    async saveOS(os,beforeId){ return request('/operacao/os',{method:'POST',body:JSON.stringify({os,beforeId,action:'save'})}); },
    async deleteOS(os){ return request('/operacao/os',{method:'POST',body:JSON.stringify({os,beforeId:os.id,action:'delete'})}); },
    async backup(){return request('/backup');},
    async auditoria(){return request('/auditoria');},
    async stockMovements(limit=200){return request('/estoque/movimentos?limit='+encodeURIComponent(limit));},
    async stockMove(productId,type,quantity,reason){return request('/estoque/movimentar',{method:'POST',body:JSON.stringify({productId,type,quantity,reason})});},
    async cash(){return request('/financeiro/caixa');},
    async openCash(openingAmount,notes){return request('/financeiro/caixa/abrir',{method:'POST',body:JSON.stringify({openingAmount,notes})});},
    async closeCash(actualAmount,notes){return request('/financeiro/caixa/fechar',{method:'POST',body:JSON.stringify({actualAmount,notes})});},
    async cashMove(type,category,description,amount,paymentMethod,referenceType,referenceId){return request('/financeiro/caixa/movimento',{method:'POST',body:JSON.stringify({type,category,description,amount,paymentMethod,referenceType,referenceId})});},
    async restore(state){return request('/restore',{method:'POST',body:JSON.stringify({state})});},
    setLocal
  };
  localStorage.setItem=function(key,value){
    native.set(key,value);
    if(keys.includes(key)){
      const token=native.get('apiToken');
      if(token){let data;try{data=JSON.parse(value);}catch{return;} request('/data/'+encodeURIComponent(key),{method:'PUT',body:JSON.stringify({records:data})}).catch(()=>{});}
    }
  };
  localStorage.removeItem=function(key){native.remove(key);};
  window.addEventListener('online',()=>window.oficinaAPI.sync());
  document.addEventListener('DOMContentLoaded',()=>{if(native.get('apiToken'))window.oficinaAPI.sync();});
})();
