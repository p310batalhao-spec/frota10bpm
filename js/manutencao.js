// ============================================================
// FIREBASE REST
// ============================================================
const FB_URL = 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';

async function fb_get(no)           { const r = await fetch(`${FB_URL}/${no}.json`); return r.json(); }
async function fb_post(no, dados)   { const r = await fetch(`${FB_URL}/${no}.json`, { method:'POST', body:JSON.stringify(dados), headers:{'Content-Type':'application/json'} }); return r.json(); }
async function fb_put(no, id, dados){ const r = await fetch(`${FB_URL}/${no}/${id}.json`, { method:'PUT', body:JSON.stringify(dados), headers:{'Content-Type':'application/json'} }); return r.json(); }
async function fb_patch(no, id, dados){ const r = await fetch(`${FB_URL}/${no}/${id}.json`, { method:'PATCH', body:JSON.stringify(dados), headers:{'Content-Type':'application/json'} }); return r.json(); }
async function fb_delete(no, id)    { return fetch(`${FB_URL}/${no}/${id}.json`, { method:'DELETE' }); }

// ============================================================
// PARÂMETROS DE REVISÃO (KM)
// ============================================================
const PARAMETROS = {
    'ROTACAR':  5000,
    'OK':       5000,
    'STYLE':    10000,
    'PROPRIA':  10000,
    'PMAL':     10000,
    'BRASCAR':  10000,
    'LOCALIZA': 10000,
    'UNIDAS':   10000,
};
const ALERTA_REVISAO = 400;  // faltando ≤400km
const ALERTA_ATENCAO = 600;  // faltando ≤600km

function getIntervalo(locadora) {
    if (!locadora) return 10000;
    const key = locadora.toUpperCase().replace(/LOCADORA\s*/,'').trim();
    return PARAMETROS[key] || 10000;
}

function calcularSituacao(kmAtual, kmProxima, locadora) {
    const proximo = kmProxima || (calcularProximaRevisao(kmAtual, locadora));
    const falta = proximo - kmAtual;
    if (falta <= ALERTA_REVISAO) return { status: 'revisao', falta, proximo };
    if (falta <= ALERTA_ATENCAO) return { status: 'atencao', falta, proximo };
    return { status: 'ok', falta, proximo };
}

function calcularProximaRevisao(kmAtual, locadora) {
    const intervalo = getIntervalo(locadora);
    return Math.ceil(kmAtual / intervalo) * intervalo;
}

// ============================================================
// ESTADO GLOBAL
// ============================================================
let dadosTabela = [];        // array de viaturas para tabela
let viaturaAtiva = null;     // viatura aberta no modal
let notificacoes = [];       // array de notifs globais
let manutencoesCache = {}; // Já deve existir
let viaturasCache = {};    // ADICIONE ESTA LINHA se não existir
let placaViaturaAberta = ""; // Auxiliar para a aba de vistorias

// ============================================================
// RELÓGIO & AUTH
// ============================================================
function atualizarRelogio() {
    const a = new Date();
    document.getElementById('relogio').innerHTML =
        `${a.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'long',year:'numeric'})} <br> ${a.toLocaleTimeString('pt-BR')}`;
}

function checkLogin() {
    const u = localStorage.getItem('frota_usuario');
    if (!u) { window.location.href = '/page/login.html'; return; }
    document.getElementById('user-info').innerHTML = `<p>Bem-Vindo(a):</p><p class="user-nome">${u}</p>`;
}

function logout() {
    localStorage.removeItem('frota_usuario');
    localStorage.removeItem('frota_perfil');
    window.location.href = '/page/login.html';
}

// ============================================================
// TOAST
// ============================================================
function toast(msg, tipo='info', duracao=4000) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    const icon = tipo==='success'?'check_circle':tipo==='warning'?'warning':tipo==='danger'?'error':'notifications';
    t.innerHTML = `<span class="material-icons" style="font-size:1.1rem">${icon}</span><span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => t.remove(), duracao);
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================
function adicionarNotificacao(msg, tipo, placa='') {
    const notif = { msg, tipo, placa, ts: Date.now() };
    notificacoes.unshift(notif);
    renderizarNotificacoes();
}

function renderizarNotificacoes() {
    const list = document.getElementById('notif-list');
    const badge = document.getElementById('notif-count');

    if (!notificacoes.length) {
        list.innerHTML = '<div class="notif-empty">Nenhuma notificação.</div>';
        badge.style.display = 'none';
        return;
    }

    const icons = { revisao:'warning', atencao:'error_outline', cadastro:'check_circle', info:'info' };
    list.innerHTML = notificacoes.map(n => `
        <div class="notif-item ${n.tipo}">
            <span class="material-icons">${icons[n.tipo]||'info'}</span>
            <div>
                <div style="font-weight:600">${n.placa ? `[${n.placa}] ` : ''}${n.msg}</div>
                <div style="color:#aaa;font-size:.70rem">${new Date(n.ts).toLocaleString('pt-BR')}</div>
            </div>
        </div>
    `).join('');

    badge.textContent = notificacoes.length > 99 ? '99+' : notificacoes.length;
    badge.style.display = 'flex';
}

document.getElementById('notif-toggle').addEventListener('click', () => {
    const dd = document.getElementById('notif-dropdown');
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
});
document.addEventListener('click', e => {
    if (!e.target.closest('#notif-toggle') && !e.target.closest('#notif-dropdown')) {
        document.getElementById('notif-dropdown').style.display = 'none';
    }
});

// ============================================================
// DRAG & DROP UPLOAD
// ============================================================
const uploadZone = document.getElementById('upload-zone');
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
    e.preventDefault(); uploadZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) processarPlanilha(f);
});

// ============================================================
// PROCESSAR PLANILHA
// ============================================================
async function processarPlanilha(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xls','xlsx','xlsm'].includes(ext)) {
        mostrarStatus('Formato inválido. Use .xls, .xlsx ou .xlsm', 'error');
        return;
    }

    showLoading('Lendo planilha...');
    try {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array', cellDates: true });

        // Tenta a primeira planilha com dados relevantes
        let sheet = wb.Sheets[wb.SheetNames[0]];
        let data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        // Detectar linha de cabeçalho (procura "VIATURA" ou "PLACA" ou "PREFIXO")
        let headerRow = -1;
        for (let i = 0; i < Math.min(data.length, 10); i++) {
            const row = data[i].map(c => String(c).toUpperCase());
            if (row.some(c => c.includes('PLACA') || c.includes('VIATURA') || c.includes('PREFIXO'))) {
                headerRow = i;
                break;
            }
        }

        if (headerRow === -1) {
            // Tenta planilha "KM" se existir
            const kmSheet = wb.Sheets['KM'] || wb.Sheets['km'];
            if (kmSheet) {
                sheet = kmSheet;
                data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                for (let i = 0; i < Math.min(data.length, 10); i++) {
                    const row = data[i].map(c => String(c).toUpperCase());
                    if (row.some(c => c.includes('PLACA') || c.includes('VIATURA') || c.includes('PREFIXO') || c.includes('UNIDADE'))) {
                        headerRow = i;
                        break;
                    }
                }
            }
        }

        if (headerRow === -1) { mostrarStatus('Não foi possível identificar o cabeçalho da planilha.', 'error'); hideLoading(); return; }

        const headers = data[headerRow].map(h => String(h).trim());
        const rows = data.slice(headerRow + 1).filter(r => r.some(c => c !== ''));

        showLoading('Mapeando colunas...');

        // Mapeamento flexível de colunas
        function findCol(keywords) {
            for (const kw of keywords) {
                const idx = headers.findIndex(h => h.toUpperCase().includes(kw.toUpperCase()));
                if (idx !== -1) return idx;
            }
            return -1;
        }

        const cols = {
            prefixo:      findCol(['PREFIXO']),
            placa:        findCol(['PLACA', 'VIATURA']),
            unidade:      findCol(['UNIDADE', 'BASE']),
            kmAtual:      findCol(['KM VEICULO', 'KM', 'HODÔMETRO', 'HODOMETRO']),
            ultRevisao:   findCol(['ULT', 'ÚLTIMA', 'ULTIMA', 'REVISÃO', 'REVISAO']),
            proxRevisao:  findCol(['PRÓX', 'PROX', 'PRÓXIMA', 'PROXIMA']),
            situacao:     findCol(['STATUS VEICULO', 'SITUAÇÃO', 'SITUACAO', 'STATUS']),
            locadora:     findCol(['LOCADORA', 'PROPRIETARIO', 'PROPRIETÁRIO', 'PROP', 'ÓRGÃO', 'ORGAO']),
            obs:          findCol(['OBS', 'OBSERV']),
            modelo:       findCol(['MODELO']),
            marca:        findCol(['MARCA']),
            ano:          findCol(['ANO']),
            combustivel:  findCol(['COMBUSTÍVEL', 'COMBUSTIVEL']),
            chassi:       findCol(['CHASSI']),
            cartao:       findCol(['NÚMERO CARTÃO', 'NUMERO CARTAO', 'CARTÃO', 'CARTAO']),
            cor:          findCol(['COR']),
            renavam:      findCol(['RENAVAM']),
            tipo:         findCol(['TIPO FROTA', 'TIPO']),
            subUnidade:   findCol(['SUBUNIDADE', 'SUB UNIDADE']),
            orgao:        findCol(['ÓRGÃO', 'ORGAO']),
        };

        showLoading('Salvando no Firebase...');

        const usuario = localStorage.getItem('frota_usuario') || 'Sistema';
        let cadastrados = 0, atualizados = 0;

        // Carregar viaturas existentes
        const viaturasFB = await fb_get('viaturas') || {};
        const manutFB    = await fb_get('manutencao') || {};

        // Índice por placa para lookup rápido
        const porPlaca = {};
        Object.entries(viaturasFB).forEach(([id, v]) => {
            if (v.placa) porPlaca[v.placa.toUpperCase().replace(/[^A-Z0-9]/g,'')] = id;
        });

        const viaturas = [];

        for (const row of rows) {
            const placa   = String(row[cols.placa]   || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
            const prefixo = String(row[cols.prefixo] || '').trim();

            if (!placa && !prefixo) continue;

            const kmAtual     = parseFloat(String(row[cols.kmAtual] || '0').replace(/[^\d.]/g,'')) || 0;
            const proxRevisao = parseFloat(String(row[cols.proxRevisao] || '0').replace(/[^\d.]/g,'')) || 0;

            // ── Campos extras mapeados da planilha ──────────────────
            const marca       = cols.marca       !== -1 ? String(row[cols.marca]       || '').trim() : '';
            const modelo      = cols.modelo      !== -1 ? String(row[cols.modelo]      || '').trim() : '';
            const ano         = cols.ano         !== -1 ? String(row[cols.ano]         || '').trim() : '';
            const combustivel = cols.combustivel !== -1 ? String(row[cols.combustivel] || '').trim() : '';
            const chassi      = cols.chassi      !== -1 ? String(row[cols.chassi]      || '').trim() : '';
            const cartao      = cols.cartao      !== -1 ? String(row[cols.cartao]      || '').trim() : '';
            const cor         = cols.cor         !== -1 ? String(row[cols.cor]         || '').trim() : '';
            const renavam     = cols.renavam     !== -1 ? String(row[cols.renavam]     || '').trim() : '';
            const unidade     = cols.unidade     !== -1 ? String(row[cols.unidade]     || '').trim() : '';
            const obs         = cols.obs         !== -1 ? String(row[cols.obs]         || '').trim() : '';

            // Tipo de frota: normaliza para os valores aceitos pelo cadastro
            const tipoFrotaBruto = cols.tipo !== -1 ? String(row[cols.tipo] || '').trim().toUpperCase() : '';
            const tipo = tipoFrotaBruto.includes('LOCAD') ? 'Privado' : tipoFrotaBruto ? 'Público' : '';

            // Proprietário/Locadora: mapeia para os valores aceitos pelo cadastro
            const locadoraBruta = cols.locadora !== -1 ? String(row[cols.locadora] || '').trim() : '';
            function normalizarProprietario(val) {
                if (!val) return '';
                const v = val.toUpperCase();
                if (v.includes('STYLE'))              return 'STYLE';
                if (v.includes('LOCALIZA'))           return 'LOCALIZA';
                if (v.includes('UNIDAS'))             return 'UNIDAS';
                if (v.includes('OK'))                 return 'OK';
                if (v.includes('AMGESP'))             return 'PMAL';  // AMGESP é gestora PMAL
                if (v.includes('PMAL'))               return 'PMAL';
                return val;
            }
            const locadora             = locadoraBruta;
            const proprietarioLocadora = normalizarProprietario(locadoraBruta);

            // Status da viatura: mapeado do campo "Status Veiculo"
            function normalizarStatus(val) {
                if (!val) return 'Operacional';
                const v = val.toUpperCase();
                if (v.includes('MANUT') || v.includes('OFICINA')) return 'Manutencao';
                if (v.includes('INATIVO') || v.includes('INDISPON')) return 'Indisponivel';
                return 'Operacional';
            }
            const statusViatura = cols.situacao !== -1 ? normalizarStatus(String(row[cols.situacao] || '')) : 'Operacional';

            let ultRevisao = '';
            if (cols.ultRevisao !== -1) {
                const v = row[cols.ultRevisao];
                if (v instanceof Date) ultRevisao = v.toISOString().split('T')[0];
                else if (v) ultRevisao = String(v).trim();
            }

            const situacao = calcularSituacao(kmAtual, proxRevisao, locadora);

            const dadosManut = {
                placa:        placa || '--',
                prefixo:      prefixo || '--',
                unidade,
                kmAtual,
                proxRevisao:  situacao.proximo,
                ultRevisao,
                locadora,
                modelo,
                marca,
                obs,
                situacao:     situacao.status,
                faltaKm:      situacao.falta,
                updatedAt:    new Date().toISOString(),
                updatedBy:    usuario,
            };

            viaturas.push(dadosManut);

            // Salvar no nó "manutencao" pelo ID da viatura ou pela placa
            const vId = porPlaca[placa];
            if (vId) {
                await fb_patch('manutencao', vId, dadosManut);
                atualizados++;

                // Atualizar KM e campos na viatura principal
                await fb_patch('viaturas', vId, {
                    kmAtual,
                    status: statusViatura,
                    updatedAt: new Date().toISOString(),
                });
            } else {
                // Cadastrar nova viatura com TODOS os campos do cadastro-viaturas
                const novaViatura = {
                    placa:                 placa || '--',
                    prefixo:               prefixo || '--',
                    modelo,
                    marca,
                    ano,
                    combustivel,
                    chassi,
                    cartao,
                    cor,
                    renavam,
                    tipo,
                    proprietarioLocadora,
                    kmAtual,
                    status:                statusViatura,
                    obs,
                    criadoEm:              new Date().toISOString(),
                    criadoPor:             usuario,
                    atualizadoEm:          new Date().toISOString(),
                    atualizadoPor:         usuario,
                };
                const resultado = await fb_post('viaturas', novaViatura);
                if (resultado && resultado.name) {
                    await fb_put('manutencao', resultado.name, { ...dadosManut, viaturaId: resultado.name });
                    adicionarNotificacao(`Nova viatura cadastrada via planilha: ${prefixo || placa}`, 'cadastro', placa || prefixo);
                    toast(`✅ Viatura ${prefixo || placa} cadastrada!`, 'success');
                }
                cadastrados++;
            }

            // Notificações de alerta KM
            if (situacao.status === 'revisao') {
                adicionarNotificacao(`Revisão URGENTE! Faltam apenas ${situacao.falta} km`, 'revisao', prefixo || placa);
            } else if (situacao.status === 'atencao') {
                adicionarNotificacao(`Atenção: faltam ${situacao.falta} km para revisão`, 'atencao', prefixo || placa);
            }
        }

        dadosTabela = viaturas;
        renderizarTabela(viaturas);
        atualizarResumos(viaturas);
        verificarAlertasBanner(viaturas);

        mostrarStatus(`✅ Planilha processada: ${cadastrados} cadastradas, ${atualizados} atualizadas. Total: ${viaturas.length} viaturas.`, 'success');

        if (cadastrados > 0) toast(`📋 ${cadastrados} viatura(s) cadastradas via planilha`, 'success');
        if (atualizados > 0) toast(`🔄 ${atualizados} viatura(s) atualizadas`, 'info');

        document.getElementById('resumo-grid').style.display = '';
        document.getElementById('actions-bar').style.display = '';
        document.getElementById('table-card').style.display  = '';
        document.getElementById('empty-state').style.display = 'none';

    } catch (err) {
        console.error(err);
        mostrarStatus('Erro ao processar a planilha: ' + err.message, 'error');
    }
    hideLoading();
}

// ============================================================
// VERIFICAR ALERTAS BANNER
// ============================================================
function verificarAlertasBanner(viaturas) {
    const revisao = viaturas.filter(v => v.situacao === 'revisao');
    const atencao = viaturas.filter(v => v.situacao === 'atencao');
    const banner  = document.getElementById('alerta-banner');
    const texto   = document.getElementById('alerta-banner-texto');
    if (revisao.length > 0) {
        texto.textContent = `⛔ ${revisao.length} viatura(s) com REVISÃO URGENTE! ${atencao.length > 0 ? `| ⚠️ ${atencao.length} em Atenção` : ''}`;
        banner.classList.add('show');
    } else if (atencao.length > 0) {
        banner.style.background = 'linear-gradient(135deg, #7a5200, var(--cor-warning))';
        texto.textContent = `⚠️ ${atencao.length} viatura(s) precisam de atenção em breve.`;
        banner.classList.add('show');
    } else {
        banner.classList.remove('show');
    }
}

// ============================================================
// RENDERIZAR TABELA
// ============================================================
function renderizarTabela(viaturas) {
    const tbody = document.getElementById('tbody-manutencao');
    if (!viaturas || !viaturas.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:#aaa">Nenhuma viatura encontrada.</td></tr>';
        return;
    }

    // Ordenar: revisão > atenção > ok
    const ordem = { revisao: 0, atencao: 1, ok: 2 };
    viaturas.sort((a, b) => (ordem[a.situacao]||2) - (ordem[b.situacao]||2));

    tbody.innerHTML = viaturas.map((v, i) => {
        const sit = v.situacao || 'ok';
        const falta = v.faltaKm || 0;
        const pct = Math.max(0, Math.min(100, ((v.proxRevisao - falta) / (v.proxRevisao || 1)) * 100));

        let badgeSit = '', barClass = '';
        if (sit === 'revisao') { badgeSit = '<span class="badge badge-revisao">⛔ Revisão</span>'; barClass = 'revisao'; }
        else if (sit === 'atencao') { badgeSit = '<span class="badge badge-atencao">⚠️ Atenção</span>'; barClass = 'atencao'; }
        else { badgeSit = '<span class="badge badge-ok">✅ Em Dia</span>'; barClass = 'ok'; }

        const tipoBadge = v.locadora
            ? `<span class="badge badge-locadora" title="${v.locadora}">Locada</span>`
            : `<span class="badge badge-propria">Própria</span>`;

        const rowStyle = sit === 'revisao' ? 'background:#fff5f5' : sit === 'atencao' ? 'background:#fffbf0' : '';

        // ── CORREÇÃO 1: usa índice do array `viaturas` recebido (pode ser filtrado),
        //    mas busca sempre em dadosTabela via placa — passamos a placa diretamente. ──
        const placaEsc = (v.placa || '').replace(/'/g, "\\'");

        return `<tr style="${rowStyle}" data-idx="${i}">
            <td><strong>${v.prefixo || '--'}</strong></td>
            <td>${v.placa || '--'}</td>
            <td style="font-size:.74rem">${v.unidade || '--'}</td>
            <td>${tipoBadge} <span style="font-size:.72rem;color:#888">${v.locadora || 'PMAL'}</span></td>
            <td><strong>${(v.kmAtual||0).toLocaleString('pt-BR')} km</strong></td>
            <td style="font-size:.78rem;color:#666">${v.ultRevisao ? formatarData(v.ultRevisao) : '—'}</td>
            <td style="font-size:.78rem"><strong>${(v.proxRevisao||0).toLocaleString('pt-BR')} km</strong></td>
            <td>
                <div class="km-bar-wrap">
                    ${badgeSit}
                    <div class="km-bar-bg"><div class="km-bar-fill ${barClass}" style="width:${pct}%"></div></div>
                    <div class="km-text">Faltam: <span class="km-falta">${falta >= 0 ? falta.toLocaleString('pt-BR') + ' km' : 'VENCIDA'}</span></div>
                </div>
            </td>
            <td>${badgeSit}</td>
            <td>
                <button class="btn btn-info btn-sm" onclick="abrirDossie('${placaEsc}')">
                    <span class="material-icons" style="font-size:.9rem">folder_open</span> Dossiê
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ============================================================
// FILTROS
// ============================================================
function filtrarTabela() {
    const busca  = document.getElementById('busca').value.toLowerCase();
    const status = document.getElementById('filtro-status').value;
    const filtrado = dadosTabela.filter(v => {
        const matchBusca = !busca ||
            (v.prefixo||'').toLowerCase().includes(busca) ||
            (v.placa||'').toLowerCase().includes(busca) ||
            (v.unidade||'').toLowerCase().includes(busca) ||
            (v.modelo||'').toLowerCase().includes(busca);
        const matchStatus = !status || v.situacao === status;
        return matchBusca && matchStatus;
    });
    renderizarTabela(filtrado);
}

// ============================================================
// RESUMOS
// ============================================================
function atualizarResumos(viaturas) {
    const revisao = viaturas.filter(v => v.situacao === 'revisao').length;
    const atencao = viaturas.filter(v => v.situacao === 'atencao').length;
    const ok      = viaturas.filter(v => v.situacao === 'ok').length;
    document.getElementById('res-total').textContent   = viaturas.length;
    document.getElementById('res-revisao').textContent = revisao;
    document.getElementById('res-atencao').textContent = atencao;
    document.getElementById('res-ok').textContent      = ok;
}

// ============================================================
// MODAL DOSSIÊ
// ============================================================
function abrirDossie(placa) {
    // ── CORREÇÃO 1: busca por placa em dadosTabela, nunca por índice numérico ──
    const placaNorm = (placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const v = dadosTabela.find(item =>
        (item.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === placaNorm
    );

    if (!v) {
        console.error('Dados da viatura não encontrados para a placa:', placa);
        toast('Erro ao abrir dossiê: viatura não encontrada.', 'danger');
        return;
    }

    // Salva referência global para uso em salvarRegistro e carregarHistorico
    viaturaAtiva = { ...v };

    // Salva placa limpa para a aba de vistorias
    placaViaturaAberta = v.placa || '';

    // Título do modal
    document.getElementById('modal-dossie-titulo').textContent =
        `Dossiê: ${v.prefixo || '--'} | ${v.placa || '--'}`;

    // ── CORREÇÃO 2: preenche o grid de informações com todos os campos disponíveis ──
    const sit = v.situacao || 'ok';
    const sitLabel = sit === 'revisao' ? '⛔ Revisão Urgente' : sit === 'atencao' ? '⚠️ Atenção' : '✅ Em Dia';
    const sitColor = sit === 'revisao' ? 'var(--cor-danger)' : sit === 'atencao' ? 'var(--cor-warning)' : 'var(--cor-success)';

    const grid = document.getElementById('dossie-info-grid');
    if (grid) {
        grid.innerHTML = `
            <div class="info-item"><label>Prefixo</label><span>${v.prefixo || '—'}</span></div>
            <div class="info-item"><label>Placa</label><span>${v.placa || '—'}</span></div>
            <div class="info-item"><label>Modelo / Marca</label><span>${[v.modelo, v.marca].filter(Boolean).join(' / ') || '—'}</span></div>
            <div class="info-item"><label>Unidade</label><span>${v.unidade || '—'}</span></div>
            <div class="info-item"><label>KM Atual</label><span><strong>${(v.kmAtual || 0).toLocaleString('pt-BR')} km</strong></span></div>
            <div class="info-item"><label>Próxima Revisão</label><span>${(v.proxRevisao || 0).toLocaleString('pt-BR')} km</span></div>
            <div class="info-item"><label>Última Revisão</label><span>${v.ultRevisao ? formatarData(v.ultRevisao) : '—'}</span></div>
            <div class="info-item"><label>KM Faltando</label><span style="font-weight:700;color:${sitColor}">${(v.faltaKm || 0).toLocaleString('pt-BR')} km</span></div>
            <div class="info-item"><label>Situação</label><span style="color:${sitColor};font-weight:700">${sitLabel}</span></div>
            <div class="info-item"><label>Locadora / Tipo</label><span>${v.locadora || 'PMAL (Própria)'}</span></div>
            <div class="info-item" style="grid-column:1/-1"><label>Observações</label><span>${v.obs || '—'}</span></div>
        `;
    }

    // Pré-preenche KM do formulário de manutenção com o atual
    const rKm = document.getElementById('r-km');
    const rData = document.getElementById('r-data');
    if (rKm) rKm.value = v.kmAtual || '';
    if (rData) rData.value = new Date().toISOString().split('T')[0];

    // Reset das outras abas
    const vContent = document.getElementById('vistorias-content');
    if (vContent) vContent.innerHTML = '<p style="color:#999;font-size:.84rem">Clique na aba "Vistorias" para carregar os registros.</p>';
    const hContent = document.getElementById('historico-content');
    if (hContent) hContent.innerHTML = '<p style="color:#999;font-size:.84rem">Clique na aba "Histórico" para carregar.</p>';

    // Abre aba info por padrão
    abaTab('info');

    // ── CORREÇÃO 3: usa .open (consistente com o CSS .modal-overlay.open) ──
    document.getElementById('modal-dossie').classList.add('open');
}
function fecharModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('open');
        el.classList.remove('active'); // compatibilidade retroativa
    }
}

function abaTab(nome) {
    document.querySelectorAll('.dossie-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dossie-panel').forEach(p => p.classList.remove('active'));

    document.querySelectorAll('.dossie-tab').forEach(tab => {
        if (tab.getAttribute('onclick').includes(`'${nome}'`)) tab.classList.add('active');
    });

    const panel = document.getElementById(`panel-${nome}`);
    if (panel) panel.classList.add('active');

    if (nome === 'vistorias') {
        carregarHistoricoVistorias(placaViaturaAberta);
    }
    if (nome === 'historico' && viaturaAtiva) {
        carregarHistorico();
    }
    if (nome === 'sinistros') {
        carregarHistoricoSinistros(placaViaturaAberta);
    }
}

// ============================================================
// SALVAR REGISTRO DE MANUTENÇÃO
// ============================================================
async function salvarRegistro() {
    const data      = document.getElementById('r-data').value;
    const km        = parseFloat(document.getElementById('r-km').value) || 0;
    const tipo      = document.getElementById('r-tipo').value;
    const descricao = document.getElementById('r-descricao').value.trim();
    const proxima   = parseFloat(document.getElementById('r-proxima').value) || 0;
    const oficina   = document.getElementById('r-oficina').value.trim();
    const custo     = parseFloat(document.getElementById('r-custo').value) || 0;
    const obs       = document.getElementById('r-obs').value.trim();
    const msgEl     = document.getElementById('r-msg');
    const usuario   = localStorage.getItem('frota_usuario') || 'Sistema';

    if (!data || !tipo || !descricao) {
        msgEl.style.color = 'var(--cor-danger)';
        msgEl.textContent = '⚠️ Preencha os campos obrigatórios: data, tipo e descrição.';
        return;
    }

    showLoading('Salvando registro...');
    try {
        const registro = {
            placa:      viaturaAtiva.placa,
            prefixo:    viaturaAtiva.prefixo,
            unidade:    viaturaAtiva.unidade,
            data,
            km,
            tipo,
            descricao,
            proximaRevisaoKm: proxima || calcularProximaRevisao(km, viaturaAtiva.locadora),
            oficina,
            custo,
            obs,
            registradoPor: usuario,
            registradoEm:  new Date().toISOString(),
        };

        await fb_post(`historico_manutencao/${viaturaAtiva.placa.replace(/[^A-Z0-9]/g,'')}`, registro);

        // Atualizar manutencao e viatura com novo KM e próxima revisão
        const novoProximo = registro.proximaRevisaoKm;
        const novaFalta   = novoProximo - km;
        const novaSit     = calcularSituacao(km, novoProximo, viaturaAtiva.locadora);

        const update = {
            kmAtual:      km,
            proxRevisao:  novoProximo,
            ultRevisao:   data,
            situacao:     novaSit.status,
            faltaKm:      novaSit.falta,
            updatedAt:    new Date().toISOString(),
            updatedBy:    usuario,
        };

        // Buscar ID da viatura no Firebase
        const viaturasFB = await fb_get('viaturas') || {};
        const vId = Object.entries(viaturasFB).find(([,v]) =>
            (v.placa||'').toUpperCase().replace(/[^A-Z0-9]/g,'') === viaturaAtiva.placa.replace(/[^A-Z0-9]/g,'')
        )?.[0];

        if (vId) {
            await fb_patch('manutencao', vId, update);
            await fb_patch('viaturas', vId, { kmAtual: km, updatedAt: new Date().toISOString() });
        }

        // Atualizar dado local
        dadosTabela[viaturaAtiva._idx] = { ...dadosTabela[viaturaAtiva._idx], ...update };
        viaturaAtiva = { ...viaturaAtiva, ...update };

        atualizarResumos(dadosTabela);
        renderizarTabela(dadosTabela);
        verificarAlertasBanner(dadosTabela);
        carregarHistorico();

        msgEl.style.color = 'var(--cor-success)';
        msgEl.textContent = '✅ Registro salvo com sucesso!';
        toast(`🔧 Manutenção registrada: ${viaturaAtiva.prefixo} — ${tipo}`, 'success');
        adicionarNotificacao(`Manutenção registrada por ${usuario}: ${tipo}`, 'cadastro', viaturaAtiva.prefixo);

        // Limpar form
        document.getElementById('r-descricao').value = '';
        document.getElementById('r-tipo').value = '';
        document.getElementById('r-oficina').value = '';
        document.getElementById('r-custo').value = '';
        document.getElementById('r-obs').value = '';

        setTimeout(() => abaTab('historico'), 1200);

    } catch (err) {
        msgEl.style.color = 'var(--cor-danger)';
        msgEl.textContent = 'Erro ao salvar: ' + err.message;
        console.error(err);
    }
    hideLoading();
}

// ============================================================
// HISTÓRICO
// ============================================================
async function carregarHistorico() {
    const cont = document.getElementById('historico-content');
    cont.innerHTML = '<p style="color:#999;font-size:.82rem">Carregando...</p>';

    try {
        const chave = viaturaAtiva.placa.replace(/[^A-Z0-9]/g,'');
        const hist  = await fb_get(`historico_manutencao/${chave}`);
        const hist_vistorias = await fb_get(`vistorias/${chave}`);

        if (!hist) {
            cont.innerHTML = '<p style="color:#aaa;font-size:.84rem;padding:16px">Nenhum registro de manutenção encontrado para esta viatura.</p>';
            return;
        }
        

        const registros = Object.values(hist).sort((a, b) => new Date(b.data) - new Date(a.data));

        cont.innerHTML = `
            <table class="historico-table">
                <thead>
                    <tr>
                        <th>Data</th><th>KM</th><th>Tipo</th><th>Descrição</th>
                        <th>Próx. Revisão</th><th>Oficina</th><th>Custo</th><th>Por</th>
                    </tr>
                </thead>
                <tbody>
                    ${registros.map(r => `
                        <tr>
                            <td>${formatarData(r.data)}</td>
                            <td>${(r.km||0).toLocaleString('pt-BR')} km</td>
                            <td><strong>${r.tipo}</strong></td>
                            <td style="max-width:200px;font-size:.74rem">${r.descricao}</td>
                            <td>${(r.proximaRevisaoKm||0).toLocaleString('pt-BR')} km</td>
                            <td style="font-size:.74rem">${r.oficina||'—'}</td>
                            <td>${r.custo ? 'R$ ' + r.custo.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—'}</td>
                            <td style="font-size:.72rem;color:#888">${r.registradoPor||'—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        cont.innerHTML = '<p style="color:red;font-size:.82rem">Erro ao carregar histórico.</p>';
    }
}

// ============================================================
// EXPORTAR RELATÓRIO
// ============================================================
function exportarRelatorio() {
    if (!dadosTabela.length) { toast('Nenhum dado para exportar.', 'warning'); return; }

    const rows = dadosTabela.map(v => ({
        'Prefixo':          v.prefixo,
        'Placa':            v.placa,
        'Unidade':          v.unidade,
        'Locadora/Tipo':    v.locadora || 'PMAL',
        'KM Atual':         v.kmAtual,
        'Última Revisão':   v.ultRevisao,
        'Próxima Revisão':  v.proxRevisao,
        'KM Faltando':      v.faltaKm,
        'Situação':         v.situacao === 'revisao' ? 'REVISÃO URGENTE' : v.situacao === 'atencao' ? 'ATENÇÃO' : 'EM DIA',
        'Observações':      v.obs,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Manutenção');
    XLSX.writeFile(wb, `manutencao_frota_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast('📥 Relatório exportado!', 'success');
}

// ============================================================
// CARREGAR DADOS DO FIREBASE AO INICIAR
// ============================================================
async function carregarDadosExistentes() {
    showLoading('Carregando dados...');
    try {
        const manut = await fb_get('manutencao');
        if (!manut) { hideLoading(); return; }

        // --- IMPLEMENTAÇÃO NECESSÁRIA PARA O DOSSIÊ ---
        // Alimenta o cache global com os dados crus do Firebase (objeto com IDs como chaves)
        // Isso resolve o erro "viaturasCache is not defined"
        viaturasCache = manut; 
        // ----------------------------------------------

        const arr = Object.values(manut);
        if (!arr.length) { hideLoading(); return; }

        dadosTabela = arr.map(v => ({
            ...v,
            situacao: calcularSituacao(v.kmAtual||0, v.proxRevisao||0, v.locadora||'').status,
            faltaKm:  calcularSituacao(v.kmAtual||0, v.proxRevisao||0, v.locadora||'').falta,
        }));

        renderizarTabela(dadosTabela);
        atualizarResumos(dadosTabela);
        verificarAlertasBanner(dadosTabela);

        // Gerar notificações de alertas
        dadosTabela.forEach(v => {
            if (v.situacao === 'revisao')
                adicionarNotificacao(`Revisão URGENTE! Faltam ${v.faltaKm} km`, 'revisao', v.prefixo||v.placa);
            else if (v.situacao === 'atencao')
                adicionarNotificacao(`Atenção: faltam ${v.faltaKm} km para revisão`, 'atencao', v.prefixo||v.placa);
        });

        document.getElementById('resumo-grid').style.display = '';
        document.getElementById('actions-bar').style.display = '';
        document.getElementById('table-card').style.display  = '';
        document.getElementById('empty-state').style.display = 'none';

    } catch (err) { 
        console.error("Erro ao carregar dados:", err); 
    }
    hideLoading();
}
// ============================================================
// HELPERS
// ============================================================
function formatarData(d) {
    if (!d) return '—';
    try {
        const dt = d instanceof Date ? d : new Date(d);
        if (isNaN(dt)) return d;
        return dt.toLocaleDateString('pt-BR');
    } catch { return d; }
}

function mostrarStatus(msg, tipo) {
    const el = document.getElementById('upload-status');
    el.textContent = msg;
    el.className = `upload-status ${tipo}`;
    el.style.display = 'block';
}

function showLoading(msg='Carregando...') {
    document.getElementById('loading-msg').textContent = msg;
    document.getElementById('loading').classList.add('show');
}
function hideLoading() {
    document.getElementById('loading').classList.remove('show');
}

async function carregarHistoricoVistorias(placa) {
    const container = document.getElementById('vistorias-content');
    if (!placa) {
        container.innerHTML = '<p style="color:orange;font-size:.84rem">⚠️ Placa não identificada para busca.</p>';
        return;
    }

    container.innerHTML = '<p style="color:#666;font-size:.84rem">🔎 Buscando vistorias no Firebase...</p>';

    // ── CORREÇÃO 4: normaliza a placa para comparação (remove traços, espaços, maiúsculo) ──
    const placaNorm = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');

    try {
        const response = await fetch(`${FB_URL}/vistorias.json`);
        const dados = await response.json();

        if (!dados) {
            container.innerHTML = '<p style="color:#999;font-size:.84rem">Nenhuma vistoria encontrada no banco.</p>';
            return;
        }

        const vistoriasFiltradas = Object.keys(dados)
            .map(id => ({ id, ...dados[id] }))
            .filter(v => (v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === placaNorm)
            .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));

        if (vistoriasFiltradas.length === 0) {
            container.innerHTML = `<p style="color:#999;font-size:.84rem">Nenhuma vistoria registrada para a placa <strong>${placa}</strong>.</p>`;
            return;
        }

        // Helper para badge de item do checklist
        function itemBadge(val) {
            if (!val || val === 'Sem Alteração') return `<span style="color:#28a745;font-size:.72rem">✅ OK</span>`;
            if (val === 'Com Alteração')          return `<span style="color:#dc3545;font-weight:700;font-size:.72rem">⚠️ Alterado</span>`;
            return `<span style="color:#e09c00;font-size:.72rem" title="${val}">ℹ️ ${val}</span>`;
        }

        let html = `
            <p style="font-size:.78rem;color:#888;margin-bottom:10px">
                <strong>${vistoriasFiltradas.length}</strong> vistoria(s) encontrada(s) para <strong>${placa}</strong>
            </p>`;

        vistoriasFiltradas.forEach((v, idx) => {
            const dataF    = v.dataHora ? new Date(v.dataHora).toLocaleString('pt-BR') : '—';
            const temAvaria = v.observacoes && v.observacoes.trim() !== '';
            const collapsed = idx > 0; // Primeira aberta, demais colapsadas

            html += `
            <details style="margin-bottom:10px;border:1px solid #ddd;border-radius:8px;overflow:hidden" ${collapsed ? '' : 'open'}>
                <summary style="
                    background:var(--cor-primaria);color:white;padding:10px 14px;
                    cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;
                    font-size:.82rem;font-weight:600">
                    <span>📋 ${dataF} — ${v.posto || ''} ${v.motorista || '—'}</span>
                    <span style="font-size:.72rem;background:rgba(255,255,255,.15);padding:2px 8px;border-radius:10px">
                        KM: ${v.km || '—'} | Comb.: ${v.combustivel || '—'}
                        ${temAvaria ? ' | <span style="color:#ffaaaa">⚠️ Avaria</span>' : ''}
                    </span>
                </summary>
                <div style="padding:14px;background:white">

                    <!-- IDENTIFICAÇÃO -->
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #eee">
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Motorista</span><br><strong style="font-size:.82rem">${v.motorista || '—'}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Posto/Grad.</span><br><strong style="font-size:.82rem">${v.posto || '—'}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Matrícula</span><br><strong style="font-size:.82rem">${v.matricula || '—'}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Guarnição</span><br><strong style="font-size:.82rem">${v.guarnicao || '—'}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Odômetro</span><br><strong style="font-size:.82rem">${v.km || '—'} km</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Combustível</span><br><strong style="font-size:.82rem">${v.combustivel || '—'}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Limpeza</span><br><strong style="font-size:.82rem">${v.limpeza || '—'}</strong></div>
                    </div>

                    <!-- CHECKLIST -->
                    <p style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:8px;letter-spacing:.5px">Checklist de Itens</p>
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px 14px;font-size:.78rem">
                        <div>Equipamentos: ${itemBadge(v.equipamentos)}</div>
                        <div>Faróis: ${itemBadge(v.farois)}</div>
                        <div>Iluminação: ${itemBadge(v.iluminacao)}</div>
                        <div>Ar-condicionado: ${itemBadge(v.ar)}</div>
                        <div>Giroflex/Sirene: ${itemBadge(v.giroflex)}</div>
                        <div>Fluído radiador: ${itemBadge(v.fluido)}</div>
                        <div>Nível de óleo: ${itemBadge(v.oleo)}</div>
                        <div>Vidros: ${itemBadge(v.vidros)}</div>
                        <div>Retrovisores: ${itemBadge(v.retrovisores)}</div>
                        <div>Carroceria: ${itemBadge(v.carroceria)}</div>
                        <div>Pneus/Estepe: ${itemBadge(v.pneus)}</div>
                        <div>Estofados: ${itemBadge(v.estofados)}</div>
                        <div>Limpadores: ${itemBadge(v.limpadores)}</div>
                        <div>Rádio comunicador: ${itemBadge(v.radio)}</div>
                        <div>Cápsula retenção: ${itemBadge(v.capsula)}</div>
                    </div>

                    ${temAvaria ? `
                    <div style="margin-top:12px;padding:10px 12px;background:#fff5f5;border-left:4px solid var(--cor-danger);border-radius:0 6px 6px 0">
                        <p style="font-size:.72rem;font-weight:700;color:var(--cor-danger);margin-bottom:4px">⚠️ AVARIAS / OBSERVAÇÕES</p>
                        <p style="font-size:.82rem">${v.observacoes}</p>
                    </div>` : ''}
                </div>
            </details>`;
        });

        container.innerHTML = html;

    } catch (error) {
        console.error('Erro ao carregar vistorias:', error);
        container.innerHTML = '<p style="color:red;font-size:.84rem">Erro técnico ao acessar o banco de vistorias.</p>';
    }
}

// ============================================================
// HISTÓRICO DE SINISTROS DA VIATURA (aba Dossiê)
// ============================================================
async function carregarHistoricoSinistros(placa) {
    const container = document.getElementById('sinistros-content');
    if (!placa) {
        container.innerHTML = '<p style="color:orange;font-size:.84rem">⚠️ Placa não identificada.</p>';
        return;
    }

    container.innerHTML = '<p style="color:#666;font-size:.84rem">🔎 Buscando sinistros no Firebase...</p>';

    const placaNorm = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');

    try {
        const dados = await fb_get('sinistros');

        if (!dados) {
            container.innerHTML = `<p style="color:#999;font-size:.84rem">Nenhum sinistro registrado para <strong>${placa}</strong>.</p>`;
            return;
        }

        const lista = Object.keys(dados)
            .map(id => ({ id, ...dados[id] }))
            .filter(s => (s.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === placaNorm)
            .sort((a, b) => new Date(b.registradoEm || 0) - new Date(a.registradoEm || 0));

        if (!lista.length) {
            container.innerHTML = `
                <div style="text-align:center;padding:32px;color:#aaa">
                    <span class="material-icons" style="font-size:2.5rem;display:block;margin-bottom:8px;color:#ddd">car_crash</span>
                    <p style="font-size:.84rem">Nenhum sinistro registrado para <strong>${placa}</strong>.</p>
                </div>`;
            return;
        }

        // badge colorido por tipo
        const corTipo = {
            'Colisão':'#fde8ea','Atropelamento':'#fde8ea','Capotamento':'#ffd6d6',
            'Roubo':'#f8d7da','Furto':'#f8d7da','Incêndio':'#fff3cd',
            'Alagamento':'#d1ecf1','Tombamento':'#ffd6d6','Queda':'#fde8ea',
            'Choque':'#fde8ea','Outros':'#e2e3e5',
        };
        function tipoBadges(tipos) {
            const arr = Array.isArray(tipos) ? tipos : (tipos ? [tipos] : ['—']);
            return arr.map(t => {
                const bg = corTipo[t] || '#e2e3e5';
                return `<span style="display:inline-block;padding:2px 9px;border-radius:12px;font-size:.7rem;font-weight:700;background:${bg};color:#333;margin-right:4px">${t}</span>`;
            }).join('');
        }

        let html = `
            <p style="font-size:.78rem;color:#888;margin-bottom:12px">
                <strong>${lista.length}</strong> sinistro(s) registrado(s) para <strong>${placa}</strong>
            </p>`;

        lista.forEach((s, idx) => {
            const dataF   = s.data ? s.data.split('-').reverse().join('/') : '—';
            const horaF   = s.hora || '—';
            const tipos   = Array.isArray(s.tipos) ? s.tipos : (s.tipos ? [s.tipos] : []);
            const open    = idx === 0 ? 'open' : '';

            // Danos objetos fixos
            const fixosLabels = { poste:'Poste', muro:'Muro', parede:'Parede', arvore:'Árvore', guardRail:'Guard Rail', outrosFixos:'Outros' };
            const fixosMarcados = Object.entries(s.danoObjFixos || {})
                .filter(([,v]) => v).map(([k]) => fixosLabels[k] || k).join(', ');

            // Veículos de terceiros
            const terceiros = (s.danosTerceiros || []).filter(t => t.placa || t.marca || t.modelo);

            html += `
            <details style="margin-bottom:10px;border:1px solid #ddd;border-radius:8px;overflow:hidden" ${open}>
                <summary style="
                    background:var(--cor-primaria);color:white;
                    padding:10px 14px;cursor:pointer;list-style:none;
                    display:flex;justify-content:space-between;align-items:center;
                    font-size:.82rem;font-weight:600">
                    <span>🚨 Sinistro ${s.numero || '—'} — ${dataF} ${horaF !== '—' ? 'às '+horaF : ''}</span>
                    <span style="font-size:.72rem;background:rgba(255,255,255,.15);padding:2px 10px;border-radius:10px">
                        ${tipos.join(', ') || '—'}
                    </span>
                </summary>
                <div style="padding:14px;background:white">

                    <!-- IDENTIFICAÇÃO -->
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #eee">
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Nº Sinistro</span><br><strong style="font-size:.84rem">${s.numero || '—'}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Data / Hora</span><br><strong style="font-size:.84rem">${dataF} ${horaF !== '—' ? '– '+horaF : ''}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Tipo(s)</span><br>${tipoBadges(s.tipos)}</div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Local</span><br><strong style="font-size:.84rem">${s.local || '—'}${s.cidade ? ', '+s.cidade : ''}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Bairro</span><br><strong style="font-size:.84rem">${s.bairro || '—'}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">KM na Ocorrência</span><br><strong style="font-size:.84rem">${s.kmOcorrencia ? Number(s.kmOcorrencia).toLocaleString('pt-BR')+' km' : '—'}</strong></div>
                    </div>

                    <!-- CONDUTOR -->
                    <p style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:8px;letter-spacing:.5px">Condutor</p>
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #eee">
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Nome</span><br><strong style="font-size:.82rem">${s.condutorNome || '—'}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Posto/Grad.</span><br><strong style="font-size:.82rem">${s.condutorPosto || '—'}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">Matrícula</span><br><strong style="font-size:.82rem">${s.condutorMatricula || '—'}</strong></div>
                        <div><span style="font-size:.68rem;color:#999;text-transform:uppercase">CNH</span><br><strong style="font-size:.82rem">${s.condutorCNH || '—'}</strong></div>
                    </div>

                    <!-- DANOS -->
                    ${s.danosOficial ? `
                    <p style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:6px;letter-spacing:.5px">Danos no Veículo Oficial</p>
                    <div style="padding:8px 12px;background:#fff5f5;border-left:4px solid var(--cor-danger);border-radius:0 6px 6px 0;font-size:.82rem;margin-bottom:10px;line-height:1.5">
                        ${s.danosOficial}
                    </div>` : ''}

                    ${terceiros.length ? `
                    <p style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:6px;letter-spacing:.5px">Veículos de Terceiros Envolvidos</p>
                    <table style="width:100%;border-collapse:collapse;font-size:.78rem;margin-bottom:10px">
                        <thead><tr style="background:#f0f2f5">
                            <th style="padding:5px 8px;border:1px solid #ddd">Placa</th>
                            <th style="padding:5px 8px;border:1px solid #ddd">Marca</th>
                            <th style="padding:5px 8px;border:1px solid #ddd">Tipo</th>
                            <th style="padding:5px 8px;border:1px solid #ddd">Modelo</th>
                        </tr></thead>
                        <tbody>${terceiros.map(t => `<tr>
                            <td style="padding:5px 8px;border:1px solid #ddd">${t.placa || '—'}</td>
                            <td style="padding:5px 8px;border:1px solid #ddd">${t.marca || '—'}</td>
                            <td style="padding:5px 8px;border:1px solid #ddd">${t.tipo  || '—'}</td>
                            <td style="padding:5px 8px;border:1px solid #ddd">${t.modelo|| '—'}</td>
                        </tr>`).join('')}</tbody>
                    </table>` : ''}

                    ${fixosMarcados ? `
                    <p style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:4px;letter-spacing:.5px">Objetos Fixos Atingidos</p>
                    <p style="font-size:.82rem;margin-bottom:10px">${fixosMarcados}</p>` : ''}

                    <!-- DESCRIÇÃO -->
                    ${s.descricao ? `
                    <p style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:6px;letter-spacing:.5px">Descrição do Sinistro</p>
                    <div style="padding:10px 12px;background:#f8f9fc;border-radius:6px;font-size:.82rem;line-height:1.6;white-space:pre-wrap;margin-bottom:10px">
                        ${s.descricao}
                    </div>` : ''}

                    <!-- BOTÃO IMPRIMIR -->
                    <div style="text-align:right;margin-top:4px">
                        <a href="/relatorios/relatorio_sinistro.html?id=${s.id}" target="_blank"
                           style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;background:var(--cor-primaria);color:white;border-radius:7px;font-size:.78rem;font-weight:700;text-decoration:none">
                            <span class="material-icons" style="font-size:.95rem">print</span> Imprimir Termo
                        </a>
                    </div>

                </div>
            </details>`;
        });

        container.innerHTML = html;

    } catch (err) {
        console.error('Erro ao carregar sinistros:', err);
        container.innerHTML = '<p style="color:red;font-size:.84rem">Erro ao acessar o banco de sinistros.</p>';
    }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);
    carregarDadosExistentes();
});

// Fechar modal clicando fora
document.getElementById('modal-dossie').addEventListener('click', function(e) {
    if (e.target === this) fecharModal('modal-dossie');
});

// ============================================================
// MODAL — INSERÇÃO MANUAL DE MANUTENÇÃO
// ============================================================
let _mmViaturaId = null;

function abrirModalManual() {
    _mmViaturaId = null;
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('mm-prefixo').value  = '';
    document.getElementById('mm-placa').value    = '';
    document.getElementById('mm-modelo').value   = '';
    document.getElementById('mm-marca').value    = '';
    document.getElementById('mm-unidade').value  = '';
    document.getElementById('mm-data').value     = hoje;
    document.getElementById('mm-tipo').value     = '';
    document.getElementById('mm-km').value       = '';
    document.getElementById('mm-descricao').value = '';
    document.getElementById('mm-proxima').value  = '';
    document.getElementById('mm-oficina').value  = '';
    document.getElementById('mm-custo').value    = '';
    document.getElementById('mm-obs').value      = '';
    document.getElementById('mm-status').value   = 'Operacional';
    document.getElementById('mm-proprietario').value = '';
    document.getElementById('mm-viatura-info').style.display = 'none';
    document.getElementById('mm-viatura-nova').style.display = 'none';
    document.getElementById('mm-msg').textContent = '';
    document.getElementById('modal-manual').classList.add('open');
}

let _mmDebounce = null;
function buscarViaturaManual() {
    clearTimeout(_mmDebounce);
    _mmDebounce = setTimeout(async () => {
        const prefixo = (document.getElementById('mm-prefixo').value || '').trim().toUpperCase();
        const placa   = (document.getElementById('mm-placa').value   || '').trim().toUpperCase().replace(/\s/g, '');
        if (!prefixo && !placa) {
            document.getElementById('mm-viatura-info').style.display = 'none';
            document.getElementById('mm-viatura-nova').style.display = 'none';
            _mmViaturaId = null;
            return;
        }
        try {
            const todas = await fb_get('viaturas') || {};
            let vEnc = null, idEnc = null;
            for (const [id, v] of Object.entries(todas)) {
                const vP = (v.placa   || '').toUpperCase().replace(/\s/g, '');
                const vR = (v.prefixo || '').toUpperCase();
                if ((placa && vP === placa) || (prefixo && vR === prefixo)) {
                    vEnc = v; idEnc = id; break;
                }
            }
            if (vEnc) {
                _mmViaturaId = idEnc;
                document.getElementById('mm-viatura-info').style.display = 'block';
                document.getElementById('mm-viatura-texto').textContent =
                    `Viatura encontrada: ${vEnc.prefixo || '--'} — ${vEnc.placa || '--'} (${vEnc.modelo || '--'} ${vEnc.marca || ''})`;
                document.getElementById('mm-viatura-nova').style.display = 'none';
                // Auto-preenche campos vazios
                if (!document.getElementById('mm-modelo').value  && vEnc.modelo)   document.getElementById('mm-modelo').value  = vEnc.modelo;
                if (!document.getElementById('mm-marca').value   && vEnc.marca)    document.getElementById('mm-marca').value   = vEnc.marca;
                if (!document.getElementById('mm-unidade').value && vEnc.unidade)  document.getElementById('mm-unidade').value = vEnc.unidade;
                if (!document.getElementById('mm-km').value      && vEnc.kmAtual)  document.getElementById('mm-km').value      = vEnc.kmAtual;
                if (vEnc.proprietarioLocadora && !document.getElementById('mm-proprietario').value)
                    document.getElementById('mm-proprietario').value = vEnc.proprietarioLocadora;
            } else {
                _mmViaturaId = null;
                document.getElementById('mm-viatura-info').style.display = 'none';
                const mostrar = placa.length >= 5 || prefixo.length >= 3;
                document.getElementById('mm-viatura-nova').style.display = mostrar ? 'block' : 'none';
            }
        } catch(e) { console.error(e); }
    }, 400);
}

async function salvarManutencaoManual() {
    const prefixo    = (document.getElementById('mm-prefixo').value    || '').trim().toUpperCase();
    const placa      = (document.getElementById('mm-placa').value      || '').trim().toUpperCase().replace(/\s/g,'');
    const modelo     = (document.getElementById('mm-modelo').value     || '').trim();
    const marca      = (document.getElementById('mm-marca').value      || '').trim();
    const unidade    = (document.getElementById('mm-unidade').value    || '').trim();
    const data       = document.getElementById('mm-data').value;
    const tipo       = document.getElementById('mm-tipo').value;
    const km         = parseFloat(document.getElementById('mm-km').value)      || 0;
    const descricao  = (document.getElementById('mm-descricao').value  || '').trim();
    const proxima    = parseFloat(document.getElementById('mm-proxima').value)  || 0;
    const oficina    = (document.getElementById('mm-oficina').value    || '').trim();
    const custo      = parseFloat(document.getElementById('mm-custo').value)    || 0;
    const obs        = (document.getElementById('mm-obs').value        || '').trim();
    const status     = document.getElementById('mm-status').value;
    const proprietario = document.getElementById('mm-proprietario').value;
    const msgEl      = document.getElementById('mm-msg');
    const usuario    = localStorage.getItem('frota_usuario') || 'Sistema';

    // Validação
    if (!prefixo && !placa) {
        msgEl.style.color = 'var(--cor-danger)';
        msgEl.textContent = '⚠️ Informe ao menos o Prefixo ou a Placa.';
        return;
    }
    if (!data || !tipo || !descricao) {
        msgEl.style.color = 'var(--cor-danger)';
        msgEl.textContent = '⚠️ Preencha os campos obrigatórios: Data, Tipo e Descrição.';
        return;
    }
    if (!km) {
        msgEl.style.color = 'var(--cor-danger)';
        msgEl.textContent = '⚠️ O KM Atual é obrigatório.';
        return;
    }

    msgEl.style.color = '#555';
    msgEl.textContent = '⏳ Salvando...';
    showLoading('Salvando manutenção...');

    const locadora   = proprietario;
    const proxKm     = proxima || calcularProximaRevisao(km, locadora);
    const situacao   = calcularSituacao(km, proxKm, locadora);
    const placaChave = (placa || prefixo).replace(/[^A-Z0-9]/g, '');

    // Objeto para historico_manutencao (igual ao salvarRegistro do dossiê)
    const registro = {
        placa:             placa   || '--',
        prefixo:           prefixo || '--',
        unidade,
        data,
        km,
        tipo,
        descricao,
        proximaRevisaoKm:  proxKm,
        oficina,
        custo,
        obs,
        registradoPor:     usuario,
        registradoEm:      new Date().toISOString(),
    };

    // Objeto para nó manutencao
    const dadosManut = {
        placa:        placa   || '--',
        prefixo:      prefixo || '--',
        unidade,
        kmAtual:      km,
        ultRevisao:   data,
        proxRevisao:  proxKm,
        locadora,
        modelo, marca, obs,
        situacao:     situacao.status,
        faltaKm:      situacao.falta,
        updatedAt:    new Date().toISOString(),
        updatedBy:    usuario,
    };

    // Objeto para nó viaturas
    const dadosViatura = {
        placa:                placa   || '--',
        prefixo:              prefixo || '--',
        modelo, marca, unidade,
        proprietarioLocadora: proprietario,
        kmAtual:              km,
        status,
        obs,
        atualizadoEm:         new Date().toISOString(),
        atualizadoPor:        usuario,
    };

    try {
        let vId = _mmViaturaId;

        if (vId) {
            // Viatura existente — atualiza
            await fb_patch('manutencao', vId, dadosManut);
            await fb_patch('viaturas',   vId, dadosViatura);
        } else {
            // Nova viatura — cria
            dadosViatura.criadoEm  = new Date().toISOString();
            dadosViatura.criadoPor = usuario;
            const res = await fb_post('viaturas', dadosViatura);
            if (res && res.name) {
                vId = res.name;
                _mmViaturaId = vId;
                await fb_put('manutencao', vId, { ...dadosManut, viaturaId: vId });
            }
        }

        // *** Salva no historico_manutencao (chave = placa sem espaços/especiais) ***
        await fb_post(`historico_manutencao/${placaChave}`, registro);

        // Atualiza tabela local
        const idx = dadosTabela.findIndex(d =>
            (d.placa || '').toUpperCase().replace(/[^A-Z0-9]/g,'') === placaChave
        );
        const linhaAtualizada = {
            ...dadosManut,
            modelo, marca, unidade,
            proprietarioLocadora: proprietario,
            status, _idx: idx !== -1 ? idx : dadosTabela.length,
        };
        if (idx !== -1) {
            dadosTabela[idx] = { ...dadosTabela[idx], ...linhaAtualizada };
        } else {
            dadosTabela.push(linhaAtualizada);
        }

        atualizarResumos(dadosTabela);
        renderizarTabela(dadosTabela);
        verificarAlertasBanner(dadosTabela);

        // Garante que tabela e resumos estão visíveis
        document.getElementById('table-card').style.display    = '';
        document.getElementById('resumo-grid').style.display   = '';
        document.getElementById('actions-bar').style.display   = '';
        document.getElementById('empty-state').style.display   = 'none';

        toast(`🔧 Manutenção registrada: ${prefixo || placa} — ${tipo}`, 'success');
        adicionarNotificacao(`Manutenção manual: ${tipo}`, 'cadastro', prefixo || placa);

        msgEl.style.color = 'var(--cor-success)';
        msgEl.textContent = '✅ Manutenção salva com sucesso!';
        setTimeout(() => fecharModal('modal-manual'), 1600);

    } catch(e) {
        console.error(e);
        msgEl.style.color = 'var(--cor-danger)';
        msgEl.textContent = '❌ Erro ao salvar. Verifique a conexão.';
    }
    hideLoading();
}

document.getElementById('modal-manual').addEventListener('click', function(e) {
    if (e.target === this) fecharModal('modal-manual');
});

