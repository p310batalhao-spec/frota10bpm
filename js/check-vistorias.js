    // ================================================================
    // FIREBASE
    // ================================================================
    const FB_URL = 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';

    // ================================================================
    // ESTADO
    // ================================================================
    let vistoriasCache = [];
    let _idParaExcluir = null;

    // ================================================================
    // INIT
    // ================================================================
    window.onload = () => {
        atualizarRelogio();
        setInterval(atualizarRelogio, 1000);
        carregarVistorias();
    };

    function atualizarRelogio() {
        const a = new Date();
        const el = document.getElementById('relogio');
        if (el) el.innerHTML =
            `${a.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'long',year:'numeric'})} <br> ${a.toLocaleTimeString('pt-BR')}`;
    }

    function logout() {
        if (confirm('Deseja encerrar a sessão?')) {
            localStorage.removeItem('frota_usuario');
            localStorage.removeItem('frota_perfil');
            window.location.href = '/page/login.html';
        }
    }

    // ================================================================
    // CARREGAR VISTORIAS
    // ================================================================
    async function carregarVistorias() {
        const tabela = document.getElementById('tabela-vistorias');
        try {
            const r = await fetch(`${FB_URL}/vistorias.json`);
            const dados = await r.json();

            if (!dados) {
                tabela.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#aaa">
                    <span class="material-icons" style="font-size:2rem;display:block;margin-bottom:8px;color:#ddd">search_off</span>
                    Nenhuma vistoria encontrada.</td></tr>`;
                return;
            }

            vistoriasCache = Object.keys(dados)
                .map(id => ({ id, ...dados[id] }))
                .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));

            exibirDados(vistoriasCache);

        } catch (e) {
            console.error(e);
            tabela.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--cor-danger)">
                Erro ao carregar dados. Verifique a conexão.</td></tr>`;
        }
    }

    // ================================================================
    // EXIBIR TABELA
    // ================================================================
    function exibirDados(lista) {
        const tabela = document.getElementById('tabela-vistorias');

        if (!lista.length) {
            tabela.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#aaa">
                Nenhuma vistoria encontrada.</td></tr>`;
            document.getElementById('contador-registros').textContent = '0 registro(s)';
            return;
        }

        tabela.innerHTML = lista.map(v => {
            const dataObj = new Date(v.dataHora);
            const dataF   = isNaN(dataObj) ? (v.dataHora || '—') : dataObj.toLocaleDateString('pt-BR');
            const horaF   = isNaN(dataObj) ? '—' : dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            return `
            <tr>
                <td><strong>${v.prefixo || '—'}</strong></td>
                <td>${v.placa || '—'}</td>
                <td>${dataF}</td>
                <td>${horaF}</td>
                <td>${v.motorista || '—'}</td>
                <td>${v.posto || '—'}</td>
                <td>${v.matricula || '—'}</td>
                <td style="white-space:nowrap">
                    <button class="btn-acao btn-visualizar"
                        onclick="abrirDetalhes('${v.id}')"
                        title="Ver detalhes da vistoria">
                        <span class="material-icons">visibility</span>
                        Ver
                    </button>
                    <button class="btn-acao btn-excluir"
                        onclick="pedirConfirmacaoDel('${v.id}')"
                        title="Excluir esta vistoria">
                        <span class="material-icons">delete</span>
                        Excluir
                    </button>
                </td>
            </tr>`;
        }).join('');

        document.getElementById('contador-registros').textContent = `${lista.length} registro(s)`;
    }

    // ================================================================
    // FILTROS
    // ================================================================
    function aplicarFiltros() {
        const termo = document.getElementById('busca').value.toLowerCase();

        const filtrados = vistoriasCache.filter(v => {
            const haystack = `${v.motorista || ''} ${v.prefixo || ''} ${v.placa || ''} ${v.matricula || ''} ${v.posto || ''}`.toLowerCase();
            return haystack.includes(termo);
        });

        exibirDados(filtrados);
    }

    // ================================================================
    // MODAL — DETALHES DA VISTORIA
    // ================================================================

    // Mapa de labels para os campos de checklist
    // Adapte os nomes das chaves conforme o que seu app de vistoria grava no Firebase
    const CHECKLIST_LABELS = {
        limpeza:         'Limpeza',
        equipamentos:    'Equipamentos',
        pneus:           'Pneus',
        freios:          'Freios',
        luzes:           'Luzes',
        documentos:      'Documentos',
        extintor:        'Extintor',
        estepe:          'Estepe',
        triangulo:       'Triângulo',
        macaco:          'Macaco',
        chave_roda:      'Chave de Roda',
        para_brisa:      'Para-brisa',
        retrovisores:    'Retrovisores',
        cintos:          'Cintos',
        buzina:          'Buzina',
    };

    // Campos que são de identificação (mostrados na seção motorista/viatura, não no checklist)
    const CAMPOS_EXCLUIDOS_CHECKLIST = new Set([
        'id','prefixo','placa','dataHora','motorista','posto','matricula',
        'combustivel','km','observacoes','obs','createdAt','criadoEm',
        'criadoPor','usuario','km_inicial','km_final'
    ]);

    function abrirDetalhes(id) {
        const v = vistoriasCache.find(x => x.id === id);
        if (!v) return;

        const dataObj = new Date(v.dataHora);
        const dataF   = isNaN(dataObj) ? (v.dataHora || '—') : dataObj.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
        const horaF   = isNaN(dataObj) ? '—' : dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        // Cabeçalho
        document.getElementById('det-placa').textContent         = v.placa    || '—';
        document.getElementById('det-prefixo').textContent       = v.prefixo  || '—';
        document.getElementById('det-motorista-sub').textContent = `${v.posto || ''} ${v.motorista || '—'} · Mat: ${v.matricula || '—'}`;
        document.getElementById('det-data').textContent          = dataF;
        document.getElementById('det-hora').textContent          = horaF;

        // Grid motorista
        document.getElementById('det-grid-motorista').innerHTML = camposParaGrid([
            ['Motorista', v.motorista],
            ['Posto / Graduação', v.posto],
            ['Matrícula', v.matricula],
        ]);

        // Grid viatura
        document.getElementById('det-grid-viatura').innerHTML = camposParaGrid([
            ['Prefixo', v.prefixo],
            ['Placa', v.placa],
            ['Combustível', v.combustivel],
            ['KM Registrado', v.km ? Number(v.km).toLocaleString('pt-BR') + ' km' : null],
            ['KM Inicial', v.km_inicial ? Number(v.km_inicial).toLocaleString('pt-BR') + ' km' : null],
            ['KM Final', v.km_final   ? Number(v.km_final).toLocaleString('pt-BR')   + ' km' : null],
        ]);

        // "Sem Alteração" => verde. "Com Alteração"/"Outro" => vermelho. Resto => verde (informativo).
        function itemEstaOk(valor) {
            if (valor === null || valor === undefined || valor === '') return null;
            const v = String(valor).trim()
                .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
            if (v === 'com alteracao' || v === 'outro') return false;
            return true;
        }

        // Checklist — só campos listados em CHECKLIST_LABELS e não excluídos
        const checkItems = [];
        for (const [chave, valor] of Object.entries(v)) {
            if (CAMPOS_EXCLUIDOS_CHECKLIST.has(chave)) continue;
            if (!CHECKLIST_LABELS[chave]) continue; // ignora campos desconhecidos
            const ok = itemEstaOk(valor);
            if (ok === null) continue; // campo vazio — omite
            checkItems.push({ label: CHECKLIST_LABELS[chave], ok, valor });
        }

        const secaoCheck = document.getElementById('det-section-checklist');
        const gridCheck  = document.getElementById('det-checklist');

        if (checkItems.length) {
            secaoCheck.style.display = '';
            gridCheck.innerHTML = checkItems.map(item => `
                <div class="check-item ${item.ok ? 'check-ok' : 'check-nok'}">
                    <span class="material-icons">${item.ok ? 'check_circle' : 'cancel'}</span>
                    <span class="ci-label">${item.label}</span>
                </div>`).join('');
        } else {
            secaoCheck.style.display = 'none';
        }

        // Observações
        const obs = v.observacoes || v.obs || '';
        document.getElementById('det-obs').innerHTML = obs
            ? obs.replace(/\n/g, '<br>')
            : '<span class="det-obs-vazio">Nenhuma observação registrada.</span>';

        document.getElementById('modal-detalhes').classList.add('open');
    }

    function camposParaGrid(pares) {
        return pares
            .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '—')
            .map(([label, valor]) => `
                <div class="det-campo">
                    <div class="dc-label">${label}</div>
                    <div class="dc-valor">${valor || '—'}</div>
                </div>`)
            .join('') || '<div style="color:#aaa;font-size:.82rem;padding:8px">Sem dados registrados.</div>';
    }

    function fecharDetalhes() {
        document.getElementById('modal-detalhes').classList.remove('open');
    }

    // ================================================================
    // EXCLUIR — CONFIRMAÇÃO
    // ================================================================
    function pedirConfirmacaoDel(id) {
        const v = vistoriasCache.find(x => x.id === id);
        if (!v) return;

        _idParaExcluir = id;

        const dataObj = new Date(v.dataHora);
        const dataF   = isNaN(dataObj) ? (v.dataHora || '—') : dataObj.toLocaleDateString('pt-BR');

        document.getElementById('del-prefixo-label').textContent  = v.prefixo  || v.placa || '—';
        document.getElementById('del-data-label').textContent     = dataF;
        document.getElementById('del-motorista-label').textContent = v.motorista || '—';

        document.getElementById('modal-confirmar-del').classList.add('open');
    }

    function fecharConfirmacaoDel() {
        document.getElementById('modal-confirmar-del').classList.remove('open');
        _idParaExcluir = null;
    }

    async function confirmarExclusao() {
        if (!_idParaExcluir) return;

        const btnDel = document.getElementById('btn-confirmar-del');
        btnDel.disabled    = true;
        btnDel.textContent = 'Excluindo...';

        try {
            const resp = await fetch(`${FB_URL}/vistorias/${_idParaExcluir}.json`, {
                method: 'DELETE'
            });

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            // Remove do cache local e atualiza tabela
            vistoriasCache = vistoriasCache.filter(x => x.id !== _idParaExcluir);
            exibirDados(vistoriasCache);
            fecharConfirmacaoDel();

        } catch (e) {
            console.error(e);
            alert('Erro ao excluir a vistoria. Verifique a conexão com o Firebase.');
        } finally {
            btnDel.disabled    = false;
            btnDel.innerHTML   = '<span class="material-icons" style="font-size:1rem;vertical-align:middle;margin-right:4px">delete_forever</span> Sim, excluir';
        }
    }

    // ================================================================
    // FECHAR MODAIS CLICANDO NO OVERLAY
    // ================================================================
    document.getElementById('modal-detalhes').addEventListener('click', function(e) {
        if (e.target === this) fecharDetalhes();
    });
    document.getElementById('modal-confirmar-del').addEventListener('click', function(e) {
        if (e.target === this) fecharConfirmacaoDel();
    });

    // ================================================================
    // PLACEHOLDER — abrir nova vistoria (mantém compatibilidade)
    // ================================================================

    // ================================================================
    // CARREGAMENTO
    // ================================================================
    carregarVistorias();
