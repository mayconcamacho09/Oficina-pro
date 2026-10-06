require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret-please-32-chars';
const ROOT = path.join(__dirname, '..');
const db = new Database(path.join(__dirname, 'oficina.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Funcionario');
CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, record_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(collection, record_id));
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id INTEGER, username TEXT, action TEXT NOT NULL, collection TEXT, record_id TEXT, details TEXT);
CREATE TABLE IF NOT EXISTS stock_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id INTEGER, username TEXT, product_id TEXT NOT NULL, product_name TEXT, type TEXT NOT NULL, quantity REAL NOT NULL, before_qty REAL NOT NULL, after_qty REAL NOT NULL, reason TEXT, os_id TEXT);
CREATE TABLE IF NOT EXISTS cash_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, opened_at TEXT NOT NULL, opened_by INTEGER, opened_username TEXT, opening_amount REAL NOT NULL DEFAULT 0, closed_at TEXT, closed_by INTEGER, closed_username TEXT, expected_amount REAL, actual_amount REAL, difference REAL, status TEXT NOT NULL DEFAULT 'open', notes TEXT);
CREATE TABLE IF NOT EXISTS cash_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id INTEGER, username TEXT, session_id INTEGER, type TEXT NOT NULL, category TEXT NOT NULL, description TEXT, amount REAL NOT NULL, payment_method TEXT, reference_type TEXT, reference_id TEXT);
`);
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) console.warn('AVISO: defina JWT_SECRET com pelo menos 32 caracteres no .env.');
function getSetting(key){ const r=db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r ? r.value : null; }
function setSetting(key,value){ db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value)); }
function setupComplete(){ return !!db.prepare("SELECT id FROM users WHERE role='Administrador' LIMIT 1").get(); }
function primaryAdminUsername(){ return getSetting('admin_username') || ''; }

const COLLECTIONS = ['usuarios','clientes','veiculos','ordens','estoque','agenda','pagamentos','despesas'];
const STOCK_STATUSES = new Set(['Aprovado','Em execução','Aguardando peça','Finalizado','Entregue']);
const ROLES = { Administrador: 100, Gerente: 80, Atendente: 60, Estoquista: 50, Mecanico: 40, 'Mecânico': 40, Funcionario: 30 };
function can(req, minimum){ return (ROLES[req.user?.role] || 0) >= minimum; }
function requireRole(minimum){ return (req,res,next)=> can(req,minimum) ? next() : res.status(403).json({error:'Seu perfil não possui permissão para esta operação.'}); }
function recordStockMovement(user, product, type, quantity, beforeQty, afterQty, reason, osId=null){
  db.prepare(`INSERT INTO stock_movements(at,user_id,username,product_id,product_name,type,quantity,before_qty,after_qty,reason,os_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(new Date().toISOString(),user?.sub||null,user?.username||'sistema',String(product.id),product.nome||'',type,Number(quantity),Number(beforeQty),Number(afterQty),reason||'',osId==null?null:String(osId));
}
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.use(express.json({ limit: '5mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));

function auth(req,res,next){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  try { req.user=jwt.verify(token,JWT_SECRET); next(); } catch { res.status(401).json({error:'Sessão inválida ou expirada.'}); }
}
function audit(user, action, collection, recordId, details='') {
  db.prepare('INSERT INTO audit(at,user_id,username,action,collection,record_id,details) VALUES(?,?,?,?,?,?,?)')
    .run(new Date().toISOString(), user?.sub || null, user?.username || 'sistema', action, collection || null, recordId == null ? null : String(recordId), details);
}
function getCollection(c){
  if(!COLLECTIONS.includes(c)) throw new Error('Coleção inválida.');
  if(c==='usuarios') return db.prepare('SELECT id,username as usuario,name as nome,role as perfil FROM users ORDER BY name').all()
    .map(u=>({id:String(u.id),nome:u.nome,usuario:u.usuario,perfil:u.perfil,principal:u.usuario.toLowerCase()===String(primaryAdminUsername()).toLowerCase()}));
  return db.prepare('SELECT record_id,data,updated_at FROM records WHERE collection=? ORDER BY updated_at DESC').all(c)
    .map(r=>({id:r.record_id,...JSON.parse(r.data),_updatedAt:r.updated_at}));
}
function getRecord(c,id){
  const r=db.prepare('SELECT record_id,data,updated_at FROM records WHERE collection=? AND record_id=?').get(c,String(id));
  return r ? {id:r.record_id,...JSON.parse(r.data),_updatedAt:r.updated_at} : null;
}
function upsert(c,item){
  const copy={...item}; delete copy._updatedAt;
  db.prepare(`INSERT INTO records(collection,record_id,data,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(collection,record_id) DO UPDATE SET data=excluded.data,updated_at=CURRENT_TIMESTAMP`)
    .run(c,String(item.id),JSON.stringify(copy));
}
function replaceCollection(c,items){
  const tx=db.transaction(()=>{
    if(c==='usuarios'){
      const current=db.prepare('SELECT id,username FROM users').all();
      const incoming=new Set(items.map(x=>String(x.id)));
      for(const u of current){
        if(!incoming.has(String(u.id)) && u.username!==primaryAdminUsername()) db.prepare('DELETE FROM users WHERE id=?').run(u.id);
      }
      for(const item of items){
        if(!item.usuario || !item.nome) continue;
        const existing=db.prepare('SELECT id FROM users WHERE username=?').get(String(item.usuario).trim());
        if(existing){
          db.prepare('UPDATE users SET name=?, role=? WHERE id=?').run(item.nome,item.perfil||'Funcionario',existing.id);
          if(item.senha) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(item.senha),12),existing.id);
        } else {
          db.prepare('INSERT INTO users(username,name,password_hash,role) VALUES(?,?,?,?)').run(String(item.usuario).trim(),item.nome,bcrypt.hashSync(String(item.senha||''),12),item.perfil||'Funcionario');
        }
      }
      return;
    }
    const existing=db.prepare('SELECT record_id FROM records WHERE collection=?').all(c).map(x=>x.record_id);
    const incoming=new Set(items.map(x=>String(x.id)));
    const del=db.prepare('DELETE FROM records WHERE collection=? AND record_id=?');
    existing.filter(id=>!incoming.has(String(id))).forEach(id=>del.run(c,id));
    items.forEach(item=>upsert(c,item));
  }); tx();
}
function qtyByProduct(pecas){
  const m={};
  for(const p of (pecas||[])) if(p?.produtoId && !p.manual) m[String(p.produtoId)]=(m[String(p.produtoId)]||0)+(Number(p.quantidade)||0);
  return m;
}
function adjustStockForOS(before, after){
  const oldMap = before && STOCK_STATUSES.has(before.status) ? qtyByProduct(before.pecas) : {};
  const newMap = after && STOCK_STATUSES.has(after.status) ? qtyByProduct(after.pecas) : {};
  const ids=new Set([...Object.keys(oldMap),...Object.keys(newMap)]);
  const get=db.prepare('SELECT record_id,data FROM records WHERE collection=? AND record_id=?');
  const changes=[];
  for(const id of ids){
    const delta=(newMap[id]||0)-(oldMap[id]||0); if(!delta) continue;
    const row=get.get('estoque',String(id)); if(!row) throw new Error(`Produto de estoque ${id} não encontrado.`);
    const p={id:row.record_id,...JSON.parse(row.data)}; const atual=Number(p.estoqueAtual)||0;
    if(delta>0 && atual<delta) throw new Error(`Estoque insuficiente para "${p.nome}". Disponível: ${atual}; necessário: ${delta}.`);
    p.estoqueAtual=atual-delta;
    changes.push({id,produto:p,delta,beforeQty:atual,afterQty:p.estoqueAtual});
  }
  for(const c of changes) {
    upsert('estoque',c.produto);
  }
  return changes;
}

app.get('/api/health',(_req,res)=>res.json({ok:true,service:'Oficina Pro API v12',configured:setupComplete(),serverTime:new Date().toISOString()}));
app.get('/api/setup/status',(req,res)=>{
  res.json({configured:setupComplete(), company:{nome:getSetting('company_name')||'',cnpj:getSetting('company_cnpj')||'',telefone:getSetting('company_phone')||'',endereco:getSetting('company_address')||''}});
});
app.post('/api/setup/initialize',(req,res)=>{
  if(setupComplete()) return res.status(409).json({error:'A configuração inicial já foi concluída.'});
  const {companyName,cnpj,telefone,endereco,adminName,adminUsername,adminEmail,adminPassword}=req.body||{};
  if(!companyName||!adminName||!adminUsername||!adminPassword) return res.status(400).json({error:'Preencha o nome da oficina, nome do administrador, usuário e senha.'});
  if(String(adminPassword).length<8) return res.status(400).json({error:'A senha do administrador deve ter pelo menos 8 caracteres.'});
  if(!/^[a-zA-Z0-9._-]{3,40}$/.test(String(adminUsername))) return res.status(400).json({error:'Usuário deve ter 3 a 40 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.'});
  try{
    const tx=db.transaction(()=>{
      const hash=bcrypt.hashSync(String(adminPassword),12);
      const r=db.prepare('INSERT INTO users(username,name,password_hash,role) VALUES(?,?,?,?)').run(String(adminUsername).trim(),String(adminName).trim(),hash,'Administrador');
      setSetting('company_name',companyName); setSetting('company_cnpj',cnpj||''); setSetting('company_phone',telefone||''); setSetting('company_address',endereco||''); setSetting('admin_email',adminEmail||''); setSetting('admin_username',String(adminUsername).trim());
      audit({sub:r.lastInsertRowid,username:String(adminUsername)},'setup','sistema',r.lastInsertRowid,'Configuração inicial da oficina');
    }); tx();
    res.json({ok:true,message:'Oficina configurada com sucesso. Agora faça login.'});
  }catch(e){res.status(409).json({error:e.message.includes('UNIQUE')?'Este usuário já existe.':e.message});}
});

app.post('/api/auth/login',(req,res)=>{
  const {username,password}=req.body||{};
  if(!setupComplete()) return res.status(403).json({error:'Faça a configuração inicial da oficina antes de entrar.'});
  if(typeof username!=='string'||typeof password!=='string') return res.status(400).json({error:'Informe usuário e senha.'});
  const u=db.prepare('SELECT id,username,name,password_hash,role FROM users WHERE username=?').get(username.trim());
  if(!u || !bcrypt.compareSync(password,u.password_hash)) return res.status(401).json({error:'Usuário ou senha inválidos.'});
  const token=jwt.sign({sub:u.id,username:u.username,name:u.name,role:u.role},JWT_SECRET,{expiresIn:'8h'});
  res.json({token,user:{id:u.id,usuario:u.username,nome:u.name,perfil:u.role,username:u.username,name:u.name,role:u.role},expiresIn:28800});
});
// Compatibilidade com a API da v8.
app.post('/api/login',(req,res)=>{
  const {usuario,senha}=req.body||{};
  req.body={username:usuario,password:senha};
  const u=db.prepare('SELECT id,username,name,password_hash,role FROM users WHERE username=?').get(String(usuario||'').trim());
  if(!u || !bcrypt.compareSync(String(senha||''),u.password_hash)) return res.status(401).json({ok:false,message:'Usuário ou senha inválidos.'});
  const token=jwt.sign({sub:u.id,username:u.username,name:u.name,role:u.role},JWT_SECRET,{expiresIn:'8h'});
  res.json({ok:true,token,user:{id:u.id,usuario:u.username,nome:u.name,perfil:u.role}});
});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));
app.get('/api/data/:collection',auth,(req,res)=>{ try{res.json(getCollection(req.params.collection));}catch(e){res.status(400).json({error:e.message});} });
app.get('/api/state',auth,(req,res)=>{const state={}; COLLECTIONS.forEach(c=>state[c]=getCollection(c)); res.json({ok:true,state});});
app.put('/api/data/:collection',auth,(req,res)=>{
  try{const c=req.params.collection, items=req.body?.records; if(!COLLECTIONS.includes(c)||!Array.isArray(items)||items.length>5000) throw new Error('Dados inválidos.'); const mins={usuarios:100,estoque:50,pagamentos:60,despesas:60,ordens:40,clientes:40,veiculos:40,agenda:40}; if(!can(req,mins[c]||40)) return res.status(403).json({error:'Sem permissão para alterar esta área.'}); replaceCollection(c,items); audit(req.user,'replace',c,null,`Registros: ${items.length}`); res.json({ok:true,count:items.length});}
  catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/save',auth,(req,res)=>{try{const {key,data}=req.body||{}; if(!COLLECTIONS.includes(key)||!Array.isArray(data)) throw new Error('Dados inválidos.'); const mins={usuarios:100,estoque:50,pagamentos:60,despesas:60,ordens:40,clientes:40,veiculos:40,agenda:40}; if(!can(req,mins[key]||40)) return res.status(403).json({error:'Sem permissão para alterar esta área.'}); replaceCollection(key,data); audit(req.user,'save',key,null,`Registros: ${data.length}`); res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});

app.post('/api/operacao/os',auth,(req,res)=>{
  const {os, beforeId, action='save'}=req.body||{};
  if(!os || os.id==null) return res.status(400).json({error:'OS inválida.'});
  try{
    const tx=db.transaction(()=>{
      const before=beforeId!=null ? getRecord('ordens',beforeId) : null;
      const stockChanges=adjustStockForOS(before, action==='delete' ? null : os);
      if(action==='delete') db.prepare('DELETE FROM records WHERE collection=? AND record_id=?').run('ordens',String(os.id));
      else upsert('ordens',os);
      stockChanges.forEach(x=>recordStockMovement(req.user,x.produto,x.delta>0?'saida':'entrada',Math.abs(x.delta),x.beforeQty,x.afterQty,action==='delete'?'Devolução por exclusão de OS':'Consumo pela OS',os.id));
      audit(req.user,action,'ordens',os.id,stockChanges.map(x=>`${x.produto.nome}: ${x.delta>0?'-':'+'}${Math.abs(x.delta)}`).join('; '));
      return stockChanges;
    });
    res.json({ok:true,ordem:getRecord('ordens',os.id),estoque:getCollection('estoque'),stockChanges:tx});
  }catch(e){res.status(409).json({error:e.message});}
});
// ========================= V10 - ESTOQUE E FINANCEIRO =========================
app.get('/api/estoque/movimentos',auth,(req,res)=>{
  const limit=Math.min(Number(req.query.limit)||200,1000);
  const rows=db.prepare('SELECT * FROM stock_movements ORDER BY id DESC LIMIT ?').all(limit);
  res.json(rows);
});
app.post('/api/estoque/movimentar',auth,requireRole(50),(req,res)=>{
  const {productId,type,quantity,reason='Ajuste de estoque'}=req.body||{};
  const q=Number(quantity);
  if(!productId || !['entrada','saida'].includes(type) || !Number.isFinite(q) || q<=0) return res.status(400).json({error:'Movimentação inválida.'});
  try{
    const tx=db.transaction(()=>{
      const row=db.prepare('SELECT record_id,data FROM records WHERE collection=? AND record_id=?').get('estoque',String(productId));
      if(!row) throw new Error('Produto não encontrado.');
      const p={id:row.record_id,...JSON.parse(row.data)}; const before=Number(p.estoqueAtual)||0;
      if(type==='saida' && before<q) throw new Error(`Estoque insuficiente. Disponível: ${before}.`);
      const after=before+(type==='entrada'?q:-q); p.estoqueAtual=after; upsert('estoque',p);
      recordStockMovement(req.user,p,type,q,before,after,reason,null);
      audit(req.user,'stock_'+type,'estoque',p.id,`${p.nome}: ${before} -> ${after}`);
      return p;
    });
    res.json({ok:true,produto:tx});
  }catch(e){res.status(409).json({error:e.message});}
});
app.get('/api/financeiro/caixa',auth,requireRole(60),(req,res)=>{
  const aberto=db.prepare("SELECT * FROM cash_sessions WHERE status='open' ORDER BY id DESC LIMIT 1").get();
  const sessoes=db.prepare('SELECT * FROM cash_sessions ORDER BY id DESC LIMIT 50').all();
  res.json({aberto:aberto||null,sessoes});
});
app.post('/api/financeiro/caixa/abrir',auth,requireRole(60),(req,res)=>{
  const amount=Number(req.body?.openingAmount)||0;
  if(amount<0) return res.status(400).json({error:'Valor inicial inválido.'});
  const existing=db.prepare("SELECT id FROM cash_sessions WHERE status='open'").get();
  if(existing) return res.status(409).json({error:'Já existe um caixa aberto.'});
  const r=db.prepare('INSERT INTO cash_sessions(opened_at,opened_by,opened_username,opening_amount,status,notes) VALUES(?,?,?,?,?,?)').run(new Date().toISOString(),req.user.sub,req.user.username,amount,'open',String(req.body?.notes||''));
  audit(req.user,'cash_open','caixa',r.lastInsertRowid,`Abertura: R$ ${amount.toFixed(2)}`);
  res.json(db.prepare('SELECT * FROM cash_sessions WHERE id=?').get(r.lastInsertRowid));
});
app.post('/api/financeiro/caixa/fechar',auth,requireRole(60),(req,res)=>{
  const actual=Number(req.body?.actualAmount);
  if(!Number.isFinite(actual)||actual<0) return res.status(400).json({error:'Informe o valor contado no caixa.'});
  const tx=db.transaction(()=>{
    const session=db.prepare("SELECT * FROM cash_sessions WHERE status='open' ORDER BY id DESC LIMIT 1").get();
    if(!session) throw new Error('Não existe caixa aberto.');
    const mov=db.prepare("SELECT COALESCE(SUM(CASE WHEN type='entrada' THEN amount ELSE -amount END),0) total FROM cash_movements WHERE session_id=?").get(session.id);
    const expected=Number(session.opening_amount)+Number(mov.total||0); const diff=actual-expected;
    db.prepare("UPDATE cash_sessions SET closed_at=?,closed_by=?,closed_username=?,expected_amount=?,actual_amount=?,difference=?,status='closed',notes=? WHERE id=?").run(new Date().toISOString(),req.user.sub,req.user.username,expected,actual,diff,String(req.body?.notes||''),session.id);
    audit(req.user,'cash_close','caixa',session.id,`Esperado: ${expected.toFixed(2)} | Contado: ${actual.toFixed(2)} | Diferença: ${diff.toFixed(2)}`);
    return db.prepare('SELECT * FROM cash_sessions WHERE id=?').get(session.id);
  });
  res.json(tx);
});
app.get('/api/financeiro/caixa/movimentos',auth,requireRole(60),(req,res)=>{
  const sessionId=req.query.sessionId?Number(req.query.sessionId):null;
  const rows=sessionId?db.prepare('SELECT * FROM cash_movements WHERE session_id=? ORDER BY id DESC').all(sessionId):db.prepare('SELECT * FROM cash_movements ORDER BY id DESC LIMIT 500').all();
  res.json(rows);
});
app.post('/api/financeiro/caixa/movimento',auth,requireRole(60),(req,res)=>{
  const {type,category='Outros',description='',amount,paymentMethod='',referenceType=null,referenceId=null}=req.body||{};
  const value=Number(amount);
  if(!['entrada','saida'].includes(type)||!Number.isFinite(value)||value<=0) return res.status(400).json({error:'Movimentação financeira inválida.'});
  const session=db.prepare("SELECT id FROM cash_sessions WHERE status='open' ORDER BY id DESC LIMIT 1").get();
  if(!session) return res.status(409).json({error:'Abra o caixa antes de registrar movimentações.'});
  const r=db.prepare('INSERT INTO cash_movements(at,user_id,username,session_id,type,category,description,amount,payment_method,reference_type,reference_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(new Date().toISOString(),req.user.sub,req.user.username,session.id,type,category,String(description),value,String(paymentMethod),referenceType,referenceId==null?null:String(referenceId));
  audit(req.user,'cash_movement', 'caixa', r.lastInsertRowid, `${type}: ${value.toFixed(2)} - ${description}`);
  res.json(db.prepare('SELECT * FROM cash_movements WHERE id=?').get(r.lastInsertRowid));
});
app.get('/api/financeiro/relatorio',auth,requireRole(60),(req,res)=>{
  const inicio=String(req.query.inicio||'0000-01-01'); const fim=String(req.query.fim||'9999-12-31');
  const pagamentos=getCollection('pagamentos').filter(p=>String(p.data||'')>=inicio&&String(p.data||'')<=fim);
  const despesas=getCollection('despesas').filter(p=>String(p.data||'')>=inicio&&String(p.data||'')<=fim);
  const entradas=pagamentos.reduce((s,p)=>s+(Number(p.valor)||0),0); const saidas=despesas.reduce((s,p)=>s+(Number(p.valor)||0),0);
  res.json({inicio,fim,entradas,saidas,saldo:entradas-saidas,pagamentos,despesas});
});
app.post('/api/restore',auth,requireRole(100),(req,res)=>{
  try{const state=req.body?.state; if(!state||typeof state!=='object') throw new Error('Backup inválido.'); const tx=db.transaction(()=>{for(const c of COLLECTIONS) if(Array.isArray(state[c])) replaceCollection(c,state[c]); audit(req.user,'restore','backup',null,'Restauração completa');}); tx(); res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/backup',auth,(req,res)=>{const state={configuracao:{nome:getSetting('company_name')||'',cnpj:getSetting('company_cnpj')||'',telefone:getSetting('company_phone')||'',endereco:getSetting('company_address')||'',emailAdministrador:getSetting('admin_email')||''}}; COLLECTIONS.forEach(c=>state[c]=getCollection(c)); const auditoria=db.prepare('SELECT at as data,username as usuario,action as acao,collection as entidade,details as detalhes FROM audit ORDER BY id DESC LIMIT 1000').all(); state.auditoria=auditoria; res.json({ok:true,exportedAt:new Date().toISOString(),version:'10.0.0',state,stockMovements:db.prepare('SELECT * FROM stock_movements ORDER BY id DESC LIMIT 1000').all(),cashSessions:db.prepare('SELECT * FROM cash_sessions ORDER BY id DESC LIMIT 100').all()});});
app.get('/api/auditoria',auth,(req,res)=>res.json(db.prepare('SELECT at as data,username as usuario,action as acao,collection as entidade,record_id as registro,details as detalhes FROM audit ORDER BY id DESC LIMIT 200').all()));

app.use(express.static(ROOT));
app.listen(port,'0.0.0.0',()=>console.log(`Oficina Pro v10 em http://localhost:${port}`));
