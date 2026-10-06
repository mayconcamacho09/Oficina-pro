// ========================================
// OFICINA PRO - FINANCEIRO
// ========================================

const STORAGE_PAGAMENTOS = "pagamentos";
const STORAGE_DESPESAS = "despesas";
const STORAGE_ORDENS = "ordens";

function lerFinanceiro(chave) {
    try {
        const dados = JSON.parse(localStorage.getItem(chave));
        return Array.isArray(dados) ? dados : [];
    } catch {
        return [];
    }
}

function salvarFinanceiro(chave, dados) {
    localStorage.setItem(chave, JSON.stringify(dados));
}

function moedaFinanceiro(valor) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(Number(valor) || 0);
}

function escaparFinanceiro(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#039;"
    }[c]));
}

function dataBRFinanceiro(valor) {
    if (!valor) return "—";
    const partes = String(valor).split("-");
    return partes.length === 3
        ? `${partes[2]}/${partes[1]}/${partes[0]}`
        : valor;
}

function hojeFinanceiro() {
    return new Date().toISOString().slice(0, 10);
}

function inicioMesAtual() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function fimMesAtual() {
    const d = new Date();
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return fim.toISOString().slice(0, 10);
}

function primeiroDiaMesAnterior() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
}

function ultimoDiaMesAnterior() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
}

function dentroDoPeriodo(data, inicio, fim) {
    if (!data) return false;
    return String(data) >= String(inicio) && String(data) <= String(fim);
}

function obterPeriodo() {
    const tipo = document.getElementById("periodo").value;

    if (tipo === "todos") {
        return { inicio: "0000-01-01", fim: "9999-12-31" };
    }

    if (tipo === "mesAnterior") {
        return {
            inicio: primeiroDiaMesAnterior(),
            fim: ultimoDiaMesAnterior()
        };
    }

    return {
        inicio: document.getElementById("dataInicio").value || inicioMesAtual(),
        fim: document.getElementById("dataFim").value || fimMesAtual()
    };
}

function obterPagamentosOS(osId) {
    return lerFinanceiro(STORAGE_PAGAMENTOS)
        .filter(p => String(p.osId) === String(osId));
}

function valorRecebidoOS(osId) {
    return obterPagamentosOS(osId)
        .reduce((s, p) => s + (Number(p.valor) || 0), 0);
}

function valorEmAbertoOS(os) {
    return Math.max(0, (Number(os.total) || 0) - valorRecebidoOS(os.id));
}

function obterContasReceber() {
    return lerFinanceiro(STORAGE_ORDENS)
        .map(os => ({
            os,
            aberto: valorEmAbertoOS(os)
        }))
        .filter(item => item.aberto > 0);
}

function atualizarSelectOS() {
    const select = document.getElementById("osRecebimento");
    const ordens = lerFinanceiro(STORAGE_ORDENS)
        .filter(os => valorEmAbertoOS(os) > 0)
        .sort((a, b) => Number(b.numero || b.id) - Number(a.numero || a.id));

    select.innerHTML = '<option value="">Selecione uma OS em aberto</option>';

    ordens.forEach(os => {
        const option = document.createElement("option");
        option.value = os.id;
        option.textContent =
            `OS #${String(os.numero || os.id).padStart(6, "0")} — ${os.cliente || "Cliente"} — ${moedaFinanceiro(valorEmAbertoOS(os))}`;
        select.appendChild(option);
    });

    if (!ordens.length) {
        select.innerHTML = '<option value="">Nenhuma OS com saldo em aberto</option>';
    }
}

function atualizarValorRecebimento() {
    const osId = document.getElementById("osRecebimento").value;
    const os = lerFinanceiro(STORAGE_ORDENS).find(o => String(o.id) === String(osId));
    const campo = document.getElementById("valorRecebimento");

    if (!os) {
        campo.value = "";
        return;
    }

    campo.value = valorEmAbertoOS(os).toFixed(2);
}

function renderContasReceber() {
    const lista = document.getElementById("listaReceber");
    const contas = obterContasReceber();
    const periodo = obterPeriodo();

    const filtradas = contas.filter(({ os }) => {
        const data = os.previsaoEntrega || os.dataEntrada;
        return dentroDoPeriodo(data, periodo.inicio, periodo.fim);
    });

    const total = filtradas.reduce((s, item) => s + item.aberto, 0);
    document.getElementById("totalReceber").textContent = moedaFinanceiro(total);

    lista.innerHTML = "";

    if (!filtradas.length) {
        lista.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhuma conta a receber no período.</td></tr>';
        return;
    }

    filtradas.slice().sort((a, b) => {
        const da = a.os.previsaoEntrega || a.os.dataEntrada || "";
        const db = b.os.previsaoEntrega || b.os.dataEntrada || "";
        return da.localeCompare(db);
    }).forEach(({ os, aberto }) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>#${String(os.numero || os.id).padStart(6, "0")}</strong></td>
            <td>${escaparFinanceiro(os.cliente)}</td>
            <td>${dataBRFinanceiro(os.previsaoEntrega || os.dataEntrada)}</td>
            <td class="valor-monetario"><strong>${moedaFinanceiro(aberto)}</strong></td>
            <td>
                <button class="btn-small btn-edit" onclick="selecionarOS(${os.id})">Receber</button>
            </td>
        `;
        lista.appendChild(tr);
    });
}

function selecionarOS(id) {
    document.getElementById("osRecebimento").value = String(id);
    atualizarValorRecebimento();
    document.getElementById("valorRecebimento").focus();
    window.scrollTo({ top: document.getElementById("formRecebimento").offsetTop - 30, behavior: "smooth" });
}

async function carregarCaixa(){
    const status=document.getElementById("statusCaixa"); const saldo=document.getElementById("saldoCaixa"); const hist=document.getElementById("historicoCaixa");
    if(!(window.oficinaAPI&&localStorage.getItem("apiToken"))){status.textContent="Modo local: o fechamento centralizado exige login no servidor.";return;}
    try{const r=await oficinaAPI.cash(); const a=r.aberto; status.textContent=a?`Caixa aberto por ${a.opened_username} desde ${new Date(a.opened_at).toLocaleString('pt-BR')}`:"Nenhum caixa aberto"; saldo.textContent=a?moedaFinanceiro(a.opening_amount):"R$ 0,00"; hist.innerHTML=(r.sessoes||[]).slice(0,10).map(x=>`<table><tbody><tr><td><strong>${x.status==='open'?'ABERTO':'FECHADO'}</strong></td><td>Abertura: ${moedaFinanceiro(x.opening_amount)}</td><td>Esperado: ${moedaFinanceiro(x.expected_amount||0)}</td><td>Contado: ${x.actual_amount==null?'—':moedaFinanceiro(x.actual_amount)}</td><td>Dif.: ${x.difference==null?'—':moedaFinanceiro(x.difference)}</td></tr></tbody></table>`).join('')||'<p class="table-subtitle">Nenhum fechamento registrado.</p>';}catch(e){status.textContent=e.message;}
}
async function abrirCaixa(){
  if(!(window.oficinaAPI&&localStorage.getItem("apiToken"))){alert("Abra o sistema conectado ao servidor para controlar o caixa.");return;}
  try{await oficinaAPI.openCash(Number(document.getElementById("valorAberturaCaixa").value)||0,document.getElementById("obsCaixa").value.trim()); alert("Caixa aberto."); carregarCaixa();}catch(e){alert(e.message);}
}
async function fecharCaixa(){
  if(!(window.oficinaAPI&&localStorage.getItem("apiToken"))){alert("O fechamento centralizado exige conexão com o servidor.");return;}
  const v=Number(document.getElementById("valorFechamentoCaixa").value); if(!Number.isFinite(v)||v<0){alert("Informe o valor contado.");return;}
  try{const r=await oficinaAPI.closeCash(v,document.getElementById("obsCaixa").value.trim()); alert(`Caixa fechado. Diferença: ${moedaFinanceiro(r.difference)}`); document.getElementById("valorFechamentoCaixa").value=""; carregarCaixa();}catch(e){alert(e.message);}
}
function renderFinanceiro() {
    const periodo = obterPeriodo();
    const ordens = lerFinanceiro(STORAGE_ORDENS);
    const pagamentos = lerFinanceiro(STORAGE_PAGAMENTOS);
    const despesas = lerFinanceiro(STORAGE_DESPESAS);

    const faturamento = ordens
        .filter(os => dentroDoPeriodo(os.dataEntrada, periodo.inicio, periodo.fim))
        .reduce((s, os) => s + (Number(os.total) || 0), 0);

    const recebimentos = pagamentos
        .filter(p => dentroDoPeriodo(p.data, periodo.inicio, periodo.fim))
        .reduce((s, p) => s + (Number(p.valor) || 0), 0);

    const despesasPeriodo = despesas
        .filter(d => dentroDoPeriodo(d.data, periodo.inicio, periodo.fim))
        .reduce((s, d) => s + (Number(d.valor) || 0), 0);

    const resultado = recebimentos - despesasPeriodo;

    document.getElementById("faturamento").textContent = moedaFinanceiro(faturamento);
    document.getElementById("recebimentos").textContent = moedaFinanceiro(recebimentos);
    document.getElementById("despesas").textContent = moedaFinanceiro(despesasPeriodo);
    document.getElementById("resultado").textContent = moedaFinanceiro(resultado);

    document.getElementById("entradasResumo").textContent = moedaFinanceiro(recebimentos);
    document.getElementById("saidasResumo").textContent = moedaFinanceiro(despesasPeriodo);
    document.getElementById("saldoResumo").textContent = moedaFinanceiro(resultado);

    const maior = Math.max(recebimentos, despesasPeriodo, 1);
    const entradaPercent = Math.round((recebimentos / maior) * 100);
    const saidaPercent = Math.round((despesasPeriodo / maior) * 100);

    document.getElementById("barEntrada").style.width = `${entradaPercent}%`;
    document.getElementById("barSaida").style.width = `${saidaPercent}%`;
    document.getElementById("percentEntrada").textContent = `${entradaPercent}%`;
    document.getElementById("percentSaida").textContent = `${saidaPercent}%`;

    renderContasReceber();
    renderMovimentacoes(periodo);
}

function montarMovimentacoes(periodo) {
    const pagamentos = lerFinanceiro(STORAGE_PAGAMENTOS).map(p => ({
        ...p,
        tipo: "Entrada",
        categoria: "OS",
        descricao: p.descricao || `Recebimento OS #${String(p.numeroOS || p.osId).padStart(6, "0")}`,
        forma: p.formaPagamento || "—"
    }));

    const despesas = lerFinanceiro(STORAGE_DESPESAS).map(d => ({
        ...d,
        tipo: "Saída",
        categoria: d.categoria || "Outros",
        descricao: d.descricao || "Despesa",
        forma: "—"
    }));

    return [...pagamentos, ...despesas]
        .filter(item => dentroDoPeriodo(item.data, periodo.inicio, periodo.fim))
        .sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

function renderMovimentacoes(periodo = obterPeriodo()) {
    const todos = montarMovimentacoes(periodo);
    const termo = document.getElementById("buscaMovimentacoes").value.toLowerCase().trim();
    const lista = document.getElementById("listaMovimentacoes");

    const filtrados = todos.filter(item =>
        [
            item.descricao,
            item.cliente,
            item.categoria,
            item.forma,
            item.tipo
        ].join(" ").toLowerCase().includes(termo)
    );

    document.getElementById("contadorMovimentacoes").textContent =
        `${filtrados.length} ${filtrados.length === 1 ? "movimentação" : "movimentações"}`;

    lista.innerHTML = "";

    if (!filtrados.length) {
        lista.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhuma movimentação encontrada.</td></tr>';
        return;
    }

    filtrados.forEach(item => {
        const entrada = item.tipo === "Entrada";
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${dataBRFinanceiro(item.data)}</td>
            <td>
                <strong>${escaparFinanceiro(item.descricao)}</strong>
                ${item.cliente ? `<small class="finance-client">${escaparFinanceiro(item.cliente)}</small>` : ""}
            </td>
            <td><span class="finance-type ${entrada ? "entrada" : "saida"}">${item.tipo}</span></td>
            <td>${escaparFinanceiro(item.categoria)}</td>
            <td>${escaparFinanceiro(item.forma)}</td>
            <td class="valor-monetario"><strong>${moedaFinanceiro(item.valor)}</strong></td>
            <td>
                <button class="btn-danger" onclick="excluirMovimentacao('${item.tipo}', ${item.id})">Excluir</button>
            </td>
        `;
        lista.appendChild(tr);
    });
}

function excluirMovimentacao(tipo, id) {
    if (!confirm("Excluir esta movimentação financeira?")) return;

    const chave = tipo === "Entrada" ? STORAGE_PAGAMENTOS : STORAGE_DESPESAS;
    const dados = lerFinanceiro(chave).filter(item => Number(item.id) !== Number(id));
    salvarFinanceiro(chave, dados);
    atualizarSelectOS();
    renderFinanceiro();
carregarCaixa();
}

document.getElementById("btnAbrirCaixa")?.addEventListener("click", abrirCaixa);
document.getElementById("btnFecharCaixa")?.addEventListener("click", fecharCaixa);

document.getElementById("periodo").addEventListener("change", () => {
    const tipo = document.getElementById("periodo").value;
    const inicio = document.getElementById("dataInicio");
    const fim = document.getElementById("dataFim");

    if (tipo === "mes") {
        inicio.value = inicioMesAtual();
        fim.value = fimMesAtual();
    } else if (tipo === "mesAnterior") {
        inicio.value = primeiroDiaMesAnterior();
        fim.value = ultimoDiaMesAnterior();
    }

    renderFinanceiro();
});

document.getElementById("btnFiltrar").addEventListener("click", renderFinanceiro);
document.getElementById("buscaMovimentacoes").addEventListener("input", () => renderMovimentacoes());

document.getElementById("osRecebimento").addEventListener("change", atualizarValorRecebimento);

document.getElementById("formRecebimento").addEventListener("submit", async e => {
    e.preventDefault();

    const osId = document.getElementById("osRecebimento").value;
    const os = lerFinanceiro(STORAGE_ORDENS).find(o => String(o.id) === String(osId));

    if (!os) {
        alert("Selecione uma Ordem de Serviço.");
        return;
    }

    const valor = Number(document.getElementById("valorRecebimento").value) || 0;
    const aberto = valorEmAbertoOS(os);

    if (valor <= 0) {
        alert("Informe um valor válido.");
        return;
    }

    if (valor > aberto + 0.01) {
        alert(`O valor máximo disponível para esta OS é ${moedaFinanceiro(aberto)}.`);
        return;
    }

    const pagamentos = lerFinanceiro(STORAGE_PAGAMENTOS);

    pagamentos.push({
        id: Date.now(),
        osId: os.id,
        numeroOS: os.numero,
        cliente: os.cliente,
        data: document.getElementById("dataRecebimento").value,
        valor,
        formaPagamento: document.getElementById("formaPagamento").value,
        descricao: document.getElementById("observacaoRecebimento").value.trim() || `Recebimento OS #${String(os.numero || os.id).padStart(6, "0")}`,
        criadoEm: new Date().toISOString()
    });

    if(window.oficinaAPI&&localStorage.getItem('apiToken')){
        try{await oficinaAPI.cashMove('entrada','OS',`Recebimento OS #${String(os.numero||os.id).padStart(6,'0')}`,valor,document.getElementById('formaPagamento').value,'OS',os.id);}catch(err){alert(err.message||'Abra o caixa antes de registrar o recebimento.');return;}
    }
    salvarFinanceiro(STORAGE_PAGAMENTOS, pagamentos);

    e.target.reset();
    document.getElementById("dataRecebimento").value = hojeFinanceiro();
    atualizarSelectOS();
    renderFinanceiro();

    alert("Recebimento registrado com sucesso.");
});

document.getElementById("formDespesa").addEventListener("submit", async e => {
    e.preventDefault();

    const despesas = lerFinanceiro(STORAGE_DESPESAS);

    despesas.push({
        id: Date.now(),
        descricao: document.getElementById("descricaoDespesa").value.trim(),
        categoria: document.getElementById("categoriaDespesa").value,
        valor: Number(document.getElementById("valorDespesa").value) || 0,
        data: document.getElementById("dataDespesa").value,
        criadoEm: new Date().toISOString()
    });

    if(window.oficinaAPI&&localStorage.getItem('apiToken')){
        try{await oficinaAPI.cashMove('saida',document.getElementById('categoriaDespesa').value,document.getElementById('descricaoDespesa').value.trim(),Number(document.getElementById('valorDespesa').value)||0,'','DESPESA',despesas[despesas.length-1].id);}catch(err){alert(err.message||'Abra o caixa antes de registrar a despesa.');return;}
    }
    salvarFinanceiro(STORAGE_DESPESAS, despesas);

    e.target.reset();
    document.getElementById("dataDespesa").value = hojeFinanceiro();
    renderFinanceiro();

    alert("Despesa registrada com sucesso.");
});

window.addEventListener("storage", e => {
    if (
        e.key === STORAGE_ORDENS ||
        e.key === STORAGE_PAGAMENTOS ||
        e.key === STORAGE_DESPESAS
    ) {
        atualizarSelectOS();
        renderFinanceiro();
    }
});

window.addEventListener("pageshow", () => {
    atualizarSelectOS();
    renderFinanceiro();
});

document.getElementById("dataInicio").value = inicioMesAtual();
document.getElementById("dataFim").value = fimMesAtual();
document.getElementById("dataRecebimento").value = hojeFinanceiro();
document.getElementById("dataDespesa").value = hojeFinanceiro();

atualizarSelectOS();
renderFinanceiro();
