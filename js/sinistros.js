// ================================================================
// FIREBASE
// ================================================================
const FB_URL = 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';
async function fb_get(no)          { const r = await fetch(`${FB_URL}/${no}.json`); return r.json(); }
async function fb_post(no, dados)  { const r = await fetch(`${FB_URL}/${no}.json`, { method:'POST', body:JSON.stringify(dados), headers:{'Content-Type':'application/json'} }); return r.json(); }
async function fb_delete(no, id)   { return fetch(`${FB_URL}/${no}/${id}.json`, { method:'DELETE' }); }

// ================================================================
// ESTADO
// ================================================================
let sinistrosCache = [];
let _idParaExcluir = null;
let _contTestemunhas = 0;
let _contTerceiros   = 0;

// ================================================================
// INIT
// ================================================================
window.onload = () => {
    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);
    checkLogin();
    carregarSinistros();
    // pré-adiciona 1 linha de veículo de terceiro e 3 testemunhas
    addVeiculoTerceiro();
    addTestemunha(); addTestemunha(); addTestemunha();
    // data padrão = hoje
    document.getElementById('s-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('s-hora').value = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
};

function atualizarRelogio() {
    const a = new Date();
    const el = document.getElementById('relogio');
    if (el) el.innerHTML = `${a.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'long',year:'numeric'})} <br> ${a.toLocaleTimeString('pt-BR')}`;
}

function checkLogin() {
    const u = localStorage.getItem('frota_usuario');
    if (!u) { window.location.href = '/page/login.html'; return; }
    document.getElementById('user-info').innerHTML = `<p>Usuário:</p><p class="user-nome">${u}</p>`;
}

function logout() {
    localStorage.removeItem('frota_usuario');
    localStorage.removeItem('frota_perfil');
    window.location.href = '/page/login.html';
}

// ================================================================
// CARREGAR E EXIBIR
// ================================================================
async function carregarSinistros() {
    try {
        const dados = await fb_get('sinistros');
        sinistrosCache = dados
            ? Object.keys(dados).map(id => ({ id, ...dados[id] }))
                .sort((a, b) => new Date(b.registradoEm || 0) - new Date(a.registradoEm || 0))
            : [];
        exibirTabela(sinistrosCache);
    } catch(e) {
        document.getElementById('tabela-sinistros').innerHTML =
            `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--cor-danger)">Erro ao carregar dados.</td></tr>`;
    }
}

function exibirTabela(lista) {
    const tbody = document.getElementById('tabela-sinistros');
    document.getElementById('contador-registros').textContent = `${lista.length} registro(s)`;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:36px;color:#aaa">
            <span class="material-icons" style="font-size:2rem;display:block;margin-bottom:8px;color:#ddd">car_crash</span>
            Nenhum sinistro registrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(s => {
        const dataF = s.data ? s.data.split('-').reverse().join('/') : '—';
        const tipos = Array.isArray(s.tipos) ? s.tipos : (s.tipos ? [s.tipos] : []);
        const tipoBadge = tipos.length
            ? tipos.map(t => `<span class="badge-tipo badge-${t.toLowerCase().replace(/ã/g,'a').replace(/ê/g,'e').replace(/é/g,'e')}">${t}</span>`).join(' ')
            : '<span class="badge-tipo badge-outros">—</span>';

        return `<tr>
            <td><strong>${s.numero || '—'}</strong></td>
            <td>${dataF}</td>
            <td><strong>${s.placa || '—'}</strong></td>
            <td>${s.prefixo || '—'}</td>
            <td>${s.condutorNome || '—'}</td>
            <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${s.local || ''}">${s.local || '—'}${s.cidade ? ', '+s.cidade : ''}</td>
            <td>${tipoBadge}</td>
            <td>${s.locadora || '—'}</td>
            <td style="white-space:nowrap">
                <button class="btn-acao btn-ver" onclick="verDetalhes('${s.id}')">
                    <span class="material-icons">visibility</span> Ver
                </button>
                <button class="btn-acao" style="background:var(--cor-success);color:white;margin-right:4px"
                    onclick="imprimirSinistro('${s.id}')" title="Imprimir Termo de Sinistro">
                    <span class="material-icons">print</span>
                </button>
                <button class="btn-acao btn-del" onclick="pedirExclusao('${s.id}')">
                    <span class="material-icons">delete</span>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function aplicarFiltros() {
    const t = document.getElementById('busca').value.toLowerCase();
    exibirTabela(sinistrosCache.filter(s =>
        `${s.placa||''} ${s.prefixo||''} ${s.condutorNome||''} ${s.numero||''} ${s.local||''} ${(s.tipos||[]).join(' ')}`.toLowerCase().includes(t)
    ));
}

// ================================================================
// BUSCA AUTOMÁTICA DA VIATURA NO FIREBASE
// ================================================================
async function buscarViatura(placa) {
    if (!placa || placa.length < 6) return;
    const placaN = placa.toUpperCase().replace(/[^A-Z0-9]/g,'');
    try {
        const dados = await fb_get('viaturas');
        if (!dados) return;
        const v = Object.values(dados).find(v =>
            (v.placa||'').toUpperCase().replace(/[^A-Z0-9]/g,'') === placaN);
        if (!v) return;
        setIfEmpty('s-prefixo',       v.prefixo   || '');
        setIfEmpty('s-marca',         v.marca     || '');
        setIfEmpty('s-modelo',        v.modelo    || '');
        setIfEmpty('s-cor',           v.cor       || '');
        setIfEmpty('s-chassi',        v.chassi    || '');
        setIfEmpty('s-renavam',       v.renavam   || '');
        setIfEmpty('s-locadora',      v.proprietarioLocadora || v.locadora || '');
        setIfEmpty('s-tipo-veiculo',  v.tipoVeiculo || '');
        setIfEmpty('s-km',            v.kmAtual   || '');
    } catch(e) {}
}

function setIfEmpty(id, val) {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = val;
}

// ================================================================
// TIPOS DE SINISTRO — checkboxes visuais
// ================================================================
function toggleTipo(cb) {
    const label = cb.closest('.tipo-item');
    label.classList.toggle('checked', cb.checked);
}

function getTiposSelecionados() {
    return [...document.querySelectorAll('.tipos-grid input[type=checkbox]:checked')]
        .map(cb => cb.value);
}

function setTiposSelecionados(tipos) {
    document.querySelectorAll('.tipos-grid input[type=checkbox]').forEach(cb => {
        cb.checked = tipos.includes(cb.value);
        cb.closest('.tipo-item').classList.toggle('checked', cb.checked);
    });
}

// ================================================================
// VEÍCULOS DE TERCEIROS — linhas dinâmicas
// ================================================================
function addVeiculoTerceiro() {
    _contTerceiros++;
    const n = _contTerceiros;
    const row = document.createElement('div');
    row.className = 'danos-terceiros-row';
    row.id = `terceiro-row-${n}`;
    row.style.cssText = 'margin-bottom:8px;gap:8px;';
    row.innerHTML = `
        <div class="form-group" style="margin:0">
            <label style="font-size:.65rem">Placa</label>
            <input type="text" id="t-placa-${n}" placeholder="Placa">
        </div>
        <div class="form-group" style="margin:0">
            <label style="font-size:.65rem">Marca</label>
            <input type="text" id="t-marca-${n}" placeholder="Marca">
        </div>
        <div class="form-group" style="margin:0">
            <label style="font-size:.65rem">Tipo</label>
            <input type="text" id="t-tipo-${n}" placeholder="Tipo">
        </div>
        <div class="form-group" style="margin:0">
            <label style="font-size:.65rem">Modelo</label>
            <input type="text" id="t-modelo-${n}" placeholder="Modelo">
        </div>`;
    document.getElementById('danos-terceiros-container').appendChild(row);
}

function coletarTerceiros() {
    const lista = [];
    for (let i = 1; i <= _contTerceiros; i++) {
        const placa  = (document.getElementById(`t-placa-${i}`)?.value || '').trim();
        const marca  = (document.getElementById(`t-marca-${i}`)?.value || '').trim();
        const tipo   = (document.getElementById(`t-tipo-${i}`)?.value || '').trim();
        const modelo = (document.getElementById(`t-modelo-${i}`)?.value || '').trim();
        if (placa || marca || tipo || modelo) lista.push({ placa, marca, tipo, modelo });
    }
    return lista;
}

// ================================================================
// TESTEMUNHAS — linhas dinâmicas
// ================================================================
function addTestemunha() {
    _contTestemunhas++;
    const n = _contTestemunhas;
    const row = document.createElement('div');
    row.className = 'testemunha-row';
    row.id = `test-row-${n}`;
    row.innerHTML = `
        <div class="form-group" style="margin:0">
            <label style="font-size:.65rem">(${n}) Nome</label>
            <input type="text" id="test-nome-${n}" placeholder="Nome da testemunha / passageiro">
        </div>
        <div class="form-group" style="margin:0">
            <label style="font-size:.65rem">Telefone</label>
            <input type="tel" id="test-fone-${n}" placeholder="(00) 00000-0000">
        </div>`;
    document.getElementById('testemunhas-container').appendChild(row);
}

function coletarTestemunhas() {
    const lista = [];
    for (let i = 1; i <= _contTestemunhas; i++) {
        const nome = (document.getElementById(`test-nome-${i}`)?.value || '').trim();
        const fone = (document.getElementById(`test-fone-${i}`)?.value || '').trim();
        if (nome) lista.push({ nome, fone });
    }
    return lista;
}

// ================================================================
// ABRIR / FECHAR CADASTRO
// ================================================================
function abrirModalCadastro() {
    // Reset checkboxes
    document.querySelectorAll('.tipos-grid input[type=checkbox]').forEach(cb => {
        cb.checked = false;
        cb.closest('.tipo-item').classList.remove('checked');
    });
    document.getElementById('modal-cadastro').classList.add('open');
}

function fecharCadastro() {
    document.getElementById('modal-cadastro').classList.remove('open');
}

// ================================================================
// SALVAR SINISTRO
// ================================================================
async function salvarSinistro() {
    const numero    = document.getElementById('s-numero').value.trim();
    const placa     = document.getElementById('s-placa').value.trim().toUpperCase();
    const condutor  = document.getElementById('s-condutor-nome').value.trim();
    const data      = document.getElementById('s-data').value;
    const descricao = document.getElementById('s-descricao').value.trim();
    const msgEl     = document.getElementById('s-msg');
    const tipos     = getTiposSelecionados();

    if (!numero || !placa || !condutor || !data || !descricao || !tipos.length) {
        msgEl.style.color = 'var(--cor-danger)';
        msgEl.textContent = '⚠️ Preencha os campos obrigatórios: Nº Sinistro, Placa, Condutor, Data, Tipo e Descrição.';
        return;
    }

    const danoObjFixos = {
        poste:       document.getElementById('dano-poste').checked,
        muro:        document.getElementById('dano-muro').checked,
        parede:      document.getElementById('dano-parede').checked,
        arvore:      document.getElementById('dano-arvore').checked,
        guardRail:   document.getElementById('dano-guard').checked,
        outrosFixos: document.getElementById('dano-outros-fixos').checked,
    };

    const dados = {
        numero,
        ug:               document.getElementById('s-ug').value.trim(),
        // Veículo
        placa,
        prefixo:          document.getElementById('s-prefixo').value.trim().toUpperCase(),
        marca:            document.getElementById('s-marca').value.trim(),
        tipoVeiculo:      document.getElementById('s-tipo-veiculo').value.trim(),
        modelo:           document.getElementById('s-modelo').value.trim(),
        cor:              document.getElementById('s-cor').value.trim(),
        anoVeiculo:       document.getElementById('s-ano-veiculo').value.trim(),
        chassi:           document.getElementById('s-chassi').value.trim(),
        renavam:          document.getElementById('s-renavam').value.trim(),
        kmOcorrencia:     Number(document.getElementById('s-km').value) || 0,
        // Locadora
        locadora:         document.getElementById('s-locadora').value.trim(),
        contrato:         document.getElementById('s-contrato').value.trim(),
        // Condutor
        condutorNome:     condutor.toUpperCase(),
        condutorMatricula:document.getElementById('s-condutor-matricula').value.trim(),
        condutorPosto:    document.getElementById('s-condutor-posto').value,
        condutorCNH:      document.getElementById('s-condutor-cnh').value.trim(),
        condutorCNHVal:   document.getElementById('s-condutor-cnh-val').value,
        condutorLotacao:  document.getElementById('s-condutor-lotacao').value.trim(),
        // Sinistro
        local:            document.getElementById('s-local').value.trim().toUpperCase(),
        bairro:           document.getElementById('s-bairro').value.trim(),
        cidade:           document.getElementById('s-cidade').value.trim().toUpperCase(),
        data,
        hora:             document.getElementById('s-hora').value,
        tipos,
        // Danos
        danosTerceiros:   coletarTerceiros(),
        danoObjFixos,
        danosOficial:     document.getElementById('s-danos-oficial').value.trim(),
        danosTerceirosDesc: document.getElementById('s-danos-terceiros-desc').value.trim(),
        // Demais
        descricao,
        testemunhas:      coletarTestemunhas(),
        servico:          document.getElementById('s-servico').value.trim(),
        responsavel:      document.getElementById('s-responsavel').value.trim(),
        obs:              document.getElementById('s-obs').value.trim(),
        // Meta
        registradoEm:     new Date().toISOString(),
        registradoPor:    localStorage.getItem('frota_usuario') || 'Sistema',
    };

    msgEl.style.color = '#555';
    msgEl.textContent = 'Salvando...';

    try {
        await fb_post('sinistros', dados);
        msgEl.style.color = 'var(--cor-success)';
        msgEl.textContent = '✅ Sinistro registrado com sucesso!';
        await carregarSinistros();
        setTimeout(fecharCadastro, 1800);
    } catch(e) {
        msgEl.style.color = 'var(--cor-danger)';
        msgEl.textContent = 'Erro ao salvar. Verifique a conexão com o Firebase.';
    }
}

// ================================================================
// VER DETALHES
// ================================================================
function verDetalhes(id) {
    const s = sinistrosCache.find(x => x.id === id);
    if (!s) return;

    const dataF = s.data ? s.data.split('-').reverse().join('/') : '—';
    const tipos = Array.isArray(s.tipos) ? s.tipos : (s.tipos ? [s.tipos] : []);

    function campo(label, val) {
        if (!val && val !== 0) return '';
        return `<div class="det-campo"><div class="dc-label">${label}</div><div class="dc-valor">${val}</div></div>`;
    }

    function secTitle(icon, txt) {
        return `<div class="det-sec-title"><span class="material-icons">${icon}</span>${txt}</div>`;
    }

    // Danos objetos fixos
    const fixosKeys = { poste:'Poste', muro:'Muro', parede:'Parede', arvore:'Árvore', guardRail:'Guard Rail', outrosFixos:'Outros' };
    const fixosMarcados = Object.entries(s.danoObjFixos || {}).filter(([,v])=>v).map(([k])=> fixosKeys[k]||k).join(', ');

    // Testemunhas
    const testHtml = (s.testemunhas||[]).length
        ? (s.testemunhas||[]).map((t,i)=>`<div style="font-size:.82rem;padding:4px 0;border-bottom:1px solid #f0f0f0">(${i+1}) <strong>${t.nome}</strong>${t.fone ? ' — '+t.fone : ''}</div>`).join('')
        : '<span style="color:#aaa;font-size:.82rem">Nenhuma testemunha registrada.</span>';

    // Veículos de terceiros
    const tercHtml = (s.danosTerceiros||[]).length
        ? `<table style="width:100%;border-collapse:collapse;font-size:.78rem;margin-top:4px">
            <thead><tr style="background:#f0f2f5"><th style="padding:5px 8px">Placa</th><th style="padding:5px 8px">Marca</th><th style="padding:5px 8px">Tipo</th><th style="padding:5px 8px">Modelo</th></tr></thead>
            <tbody>${(s.danosTerceiros||[]).map(v=>`<tr><td style="padding:5px 8px">${v.placa||'—'}</td><td style="padding:5px 8px">${v.marca||'—'}</td><td style="padding:5px 8px">${v.tipo||'—'}</td><td style="padding:5px 8px">${v.modelo||'—'}</td></tr>`).join('')}</tbody>
           </table>`
        : '<span style="color:#aaa;font-size:.82rem">Nenhum veículo de terceiro.</span>';

    document.getElementById('det-body-content').innerHTML = `
        <!-- Cabeçalho -->
        <div class="det-header-bar">
            <div class="det-num">Sinistro ${s.numero || '—'}</div>
            <div class="det-info">
                <div class="di-viatura">${s.placa || '—'} ${s.prefixo ? '('+s.prefixo+')' : ''}</div>
                <div class="di-sub">${s.condutorPosto || ''} ${s.condutorNome || '—'} · Mat: ${s.condutorMatricula || '—'}</div>
            </div>
            <div class="det-meta">
                <div class="dm-data">${dataF} às ${s.hora || '—'}</div>
                <div class="dm-local">${s.local || '—'}${s.cidade ? ', '+s.cidade : ''}</div>
            </div>
        </div>

        <!-- Tipos de sinistro -->
        <div class="det-section">
            ${secTitle('report','Tipos de Sinistro')}
            <div class="tipos-badges">
                ${tipos.map(t=>`<span class="badge-tipo badge-${t.toLowerCase().replace(/ã/g,'a').replace(/ê/g,'e')}">${t}</span>`).join('')}
            </div>
        </div>

        <!-- 03 Veículo -->
        <div class="det-section">
            ${secTitle('directions_car','03 — Dados do Veículo')}
            <div class="det-grid">
                ${campo('Placa', s.placa)}
                ${campo('Prefixo', s.prefixo)}
                ${campo('Marca', s.marca)}
                ${campo('Tipo', s.tipoVeiculo)}
                ${campo('Modelo', s.modelo)}
                ${campo('Cor', s.cor)}
                ${campo('Ano', s.anoVeiculo)}
                ${campo('Chassi', s.chassi)}
                ${campo('RENAVAM', s.renavam)}
                ${campo('KM na Ocorrência', s.kmOcorrencia ? Number(s.kmOcorrencia).toLocaleString('pt-BR')+' km' : null)}
            </div>
        </div>

        <!-- 04 Locadora -->
        <div class="det-section">
            ${secTitle('business','04 — Locadora / Proprietário')}
            <div class="det-grid">
                ${campo('Locadora', s.locadora)}
                ${campo('Nº Contrato', s.contrato)}
            </div>
        </div>

        <!-- 05 Condutor -->
        <div class="det-section">
            ${secTitle('badge','05 — Dados do Condutor')}
            <div class="det-grid">
                ${campo('Nome', s.condutorNome)}
                ${campo('Matrícula', s.condutorMatricula)}
                ${campo('Posto/Graduação', s.condutorPosto)}
                ${campo('CNH', s.condutorCNH)}
                ${campo('Validade CNH', s.condutorCNHVal ? s.condutorCNHVal.split('-').reverse().join('/') : null)}
                ${campo('Lotação', s.condutorLotacao)}
            </div>
        </div>

        <!-- 06 Sinistro -->
        <div class="det-section">
            ${secTitle('location_on','06 — Local e Data')}
            <div class="det-grid">
                ${campo('Local', s.local)}
                ${campo('Bairro', s.bairro)}
                ${campo('Cidade', s.cidade)}
                ${campo('Data', dataF)}
                ${campo('Hora', s.hora)}
                ${campo('UG', s.ug)}
            </div>
        </div>

        <!-- Danos -->
        <div class="det-section">
            ${secTitle('car_crash','Danos em Veículos de Terceiros')}
            ${tercHtml}
        </div>

        ${fixosMarcados ? `<div class="det-section">
            ${secTitle('fence','Danos em Objetos Fixos')}
            <p style="font-size:.82rem">${fixosMarcados}</p>
        </div>` : ''}

        <!-- 08 Danos -->
        ${s.danosOficial ? `<div class="det-section">
            ${secTitle('build','08A — Danos no Veículo Oficial')}
            <div class="det-desc">${s.danosOficial}</div>
        </div>` : ''}

        ${s.danosTerceirosDesc ? `<div class="det-section">
            ${secTitle('build','08B — Danos no Veículo de Terceiros')}
            <div class="det-desc">${s.danosTerceirosDesc}</div>
        </div>` : ''}

        <!-- 09 Descrição -->
        <div class="det-section">
            ${secTitle('article','09 — Descrição do Sinistro')}
            <div class="det-desc">${s.descricao || '—'}</div>
        </div>

        <!-- 07 Testemunhas -->
        <div class="det-section">
            ${secTitle('groups','07 — Testemunhas / Passageiros')}
            ${testHtml}
        </div>

        <!-- 10 Serviço -->
        <div class="det-section">
            ${secTitle('work','10 — Serviço na Ocasião')}
            <div class="det-grid">
                ${campo('Serviço que realizava', s.servico)}
                ${campo('Responsável / Subgestor', s.responsavel)}
            </div>
            ${s.obs ? `<div class="det-desc" style="margin-top:8px">${s.obs}</div>` : ''}
        </div>

        <p style="font-size:.72rem;color:#aaa;text-align:right;margin-top:8px">
            Registrado por ${s.registradoPor||'—'} em ${s.registradoEm ? new Date(s.registradoEm).toLocaleString('pt-BR') : '—'}
        </p>
    `;

    document.getElementById('modal-detalhes').classList.add('open');
}

function fecharDetalhes() {
    document.getElementById('modal-detalhes').classList.remove('open');
}

// ================================================================
// EXCLUIR
// ================================================================
function pedirExclusao(id) {
    const s = sinistrosCache.find(x => x.id === id);
    if (!s) return;
    _idParaExcluir = id;
    document.getElementById('del-num-label').textContent  = s.numero  || '—';
    document.getElementById('del-placa-label').textContent = s.placa  || '—';
    document.getElementById('modal-del').classList.add('open');
}

function fecharDel() {
    document.getElementById('modal-del').classList.remove('open');
    _idParaExcluir = null;
}

async function confirmarExclusao() {
    if (!_idParaExcluir) return;
    const btn = document.getElementById('btn-confirmar-del');
    btn.disabled = true;
    btn.textContent = 'Excluindo...';
    try {
        await fb_delete('sinistros', _idParaExcluir);
        sinistrosCache = sinistrosCache.filter(x => x.id !== _idParaExcluir);
        exibirTabela(sinistrosCache);
        fecharDel();
    } catch(e) {
        alert('Erro ao excluir. Verifique a conexão.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons" style="font-size:1rem;vertical-align:middle;margin-right:4px">delete_forever</span> Sim, excluir';
    }
}


// ================================================================
// IMPRIMIR — abre relatório em nova aba passando o ID via URL
// ================================================================
function imprimirSinistro(id) {
    window.open(`/relatorios/relatorio_sinistro.html?id=${id}`, '_blank');
}

// ================================================================
// FECHAR MODAIS CLICANDO FORA
// ================================================================
['modal-cadastro','modal-detalhes','modal-del'].forEach(id => {
    document.getElementById(id).addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('open');
    });
});
