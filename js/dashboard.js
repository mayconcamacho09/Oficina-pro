function num(v){if(typeof v==='number')return v;let s=String(v??'').replace(/R\$/gi,'').replace(/\s/g,'');if(s.includes('.')&&s.includes(','))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(',','.');return Number(s)||0}
function moeda(v){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(num(v))}
function arr(k){return lerDados(k,[]);}
function hojeISO(){return new Date().toISOString().slice(0,10)}
function atualizarDashboard(){
 const clientes=arr('clientes'),veiculos=arr('veiculos'),ordens=arr('ordens'),produtos=arr('estoque'),agenda=arr('agenda'),pag=arr('pagamentos'),desp=arr('despesas');
 document.getElementById('totalClientes').textContent=clientes.length;
 document.getElementById('totalVeiculos').textContent=veiculos.length;
 document.getElementById('totalOrdens').textContent=ordens.length;
 document.getElementById('totalProdutos').textContent=produtos.length;
 const abertas=ordens.filter(o=>!['Entregue','Cancelada','Concluída'].includes(o.status)).length;
 const crit=produtos.filter(p=>Number(p.estoqueAtual)<=Number(p.estoqueMinimo)).length;
 const recebido=pag.filter(p=>String(p.data||'').slice(0,10)===hojeISO()).reduce((s,p)=>s+num(p.valor),0);
 const despesas=desp.filter(p=>String(p.data||'').slice(0,10)===hojeISO()).reduce((s,p)=>s+num(p.valor),0);
 const faturamento=ordens.reduce((s,o)=>s+num(o.total),0);
 const map={osAbertas:abertas,estoqueCritico:crit,recebidoHoje:moeda(recebido),despesaHoje:moeda(despesas),faturamentoTotal:moeda(faturamento)};
 Object.entries(map).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=v});
 const t=document.getElementById('tabelaOrdens'); if(t){t.innerHTML=''; const ult=ordens.slice().sort((a,b)=>num(b.id)-num(a.id)).slice(0,8); if(!ult.length)t.innerHTML='<tr><td colspan="5" class="empty-state">Nenhuma ordem cadastrada.</td></tr>'; ult.forEach(o=>{const tr=document.createElement('tr');tr.innerHTML=`<td>#${String(o.numero||o.id).padStart(6,'0')}</td><td>${escaparHTML(o.cliente)}</td><td>${escaparHTML(o.veiculo)}</td><td><span class="status-badge">${escaparHTML(o.status||'—')}</span></td><td class="coluna-valor"><strong>${moeda(o.total)}</strong></td>`;t.appendChild(tr)})}
 const agendaEl=document.getElementById('agendaHoje'); if(agendaEl){agendaEl.innerHTML=''; const a=agenda.filter(x=>x.data===hojeISO()).sort((x,y)=>String(x.horario).localeCompare(String(y.horario))); if(!a.length)agendaEl.innerHTML='<p class="empty-state">Nenhum agendamento para hoje.</p>'; a.forEach(x=>{const p=document.createElement('p');p.innerHTML=`<strong>${escaparHTML(x.horario||'')}</strong> — ${escaparHTML(x.cliente||'')} <span>${escaparHTML(x.servico||'')}</span>`;agendaEl.appendChild(p)})}
}
document.addEventListener('DOMContentLoaded',()=>{atualizarDashboard();});
window.addEventListener('oficina:dados-alterados',atualizarDashboard);
window.addEventListener('storage',atualizarDashboard);
setInterval(atualizarDashboard,15000);
