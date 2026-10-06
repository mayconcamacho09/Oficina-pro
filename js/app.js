// OFICINA PRO v7 - núcleo compartilhado
const usuarioLogado = localStorage.getItem('usuarioLogado');
if (usuarioLogado !== 'true') window.location.href = 'index.html';

const nomeUsuario = localStorage.getItem('nomeUsuarioLogado') || '';
const perfilUsuario = localStorage.getItem('perfilUsuarioLogado') || '';
const loginUsuario = localStorage.getItem('loginUsuarioLogado') || '';

const permissoes = {
  Administrador: ['dashboard','clientes','veiculos','ordens','estoque','financeiro','agenda','usuarios','relatorios','backup'],
  Gerente: ['dashboard','clientes','veiculos','ordens','estoque','financeiro','agenda','relatorios','backup'],
  Atendente: ['dashboard','clientes','veiculos','ordens','agenda','relatorios'],
  Estoquista: ['dashboard','estoque'],
  Mecanico: ['dashboard','ordens'],
  'Mecânico': ['dashboard','ordens'],
  Funcionário: ['dashboard','clientes','veiculos','ordens','agenda','relatorios']
};

const MAPA_PAGINAS = {
  'dashboard.html':'dashboard','clientes.html':'clientes','veiculos.html':'veiculos',
  'ordens.html':'ordens','estoque.html':'estoque','financeiro.html':'financeiro',
  'agenda.html':'agenda','usuarios.html':'usuarios','relatorios.html':'relatorios','backup.html':'backup'
};

function lerDados(chave, fallback=[]) {
  try { const d=JSON.parse(localStorage.getItem(chave)); return d ?? fallback; }
  catch(e){ console.error('Erro ao ler', chave, e); return fallback; }
}
function salvarDados(chave, dados) {
  localStorage.setItem(chave, JSON.stringify(dados));
  try { localStorage.setItem('oficina_ultima_atualizacao', new Date().toISOString()); } catch(e){}
  window.dispatchEvent(new CustomEvent('oficina:dados-alterados',{detail:{chave}}));
}
function registrarAuditoria(acao, entidade, detalhes='') {
  const logs=lerDados('auditoria',[]);
  logs.unshift({id:Date.now()+Math.random(), data:new Date().toISOString(), usuario:loginUsuario||nomeUsuario||'sistema', acao, entidade, detalhes});
  salvarDados('auditoria', logs.slice(0,1000));
}
function formatarMoeda(v){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0)}
function escaparHTML(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function dataBR(v){if(!v)return '—'; const p=String(v).split('T')[0].split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:v}
function obterPaginaAtual(){return MAPA_PAGINAS[window.location.pathname.split('/').pop().toLowerCase()]||null}
function verificarPermissaoPagina(){const p=obterPaginaAtual(); if(!p)return; const ok=(permissoes[perfilUsuario]||[]).includes(p); if(!ok){alert('Acesso restrito!'); window.location.href='dashboard.html';}}
function aplicarPermissoesMenu(){const allowed=permissoes[perfilUsuario]||[]; document.querySelectorAll('.sidebar a[href]').forEach(a=>{const p=MAPA_PAGINAS[a.getAttribute('href').split('/').pop().toLowerCase()]; if(p&&!allowed.includes(p))a.style.display='none';});}
function sair(){['usuarioLogado','nomeUsuarioLogado','perfilUsuarioLogado','loginUsuarioLogado'].forEach(k=>localStorage.removeItem(k)); window.location.href='index.html';}
function atualizarUsuario(){document.querySelectorAll('.user-info').forEach(e=>e.textContent=`👤 ${nomeUsuario||'Usuário'} (${perfilUsuario||'—'})`)}

document.addEventListener('DOMContentLoaded',()=>{ atualizarUsuario(); verificarPermissaoPagina(); aplicarPermissoesMenu(); });
