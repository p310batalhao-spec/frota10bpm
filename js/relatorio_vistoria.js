    // ================================================================
    // FIREBASE
    // ================================================================
    const FB_URL = 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';

    async function fb_get(no) {
        const r = await fetch(`${FB_URL}/${no}.json`);
        return r.json();
    }
    async function fb_delete(no, id) {
        return fetch(`${FB_URL}/${no}/${id}.json`, { method: 'DELETE' });
    }

    // ================================================================
    // ESTADO
    // ================================================================
    let vistoriasCache = [];
    let _idParaExcluir = null;

    // ================================================================
    // MAPA COMPLETO DOS CAMPOS DO CHECKLIST (vistoria.html)
    // ================================================================
    const CHECKLIST_MAP = {
        limpeza:      { label: 'Limpeza Externa/Interna',              tipo: 'condicao' },
        equipamentos: { label: 'Equip. (Macaco/Chave/Triângulo)',       tipo: 'alteracao' },
        farois:       { label: 'Faróis (alto e baixo)',                 tipo: 'alteracao' },
        iluminacao:   { label: 'Iluminação (freios/ré/placa/laterais)', tipo: 'alteracao' },
        ar:           { label: 'Ar condicionado',                       tipo: 'alteracao' },
        giroflex:     { label: 'Giroflex e Sirenes',                    tipo: 'alteracao' },
        fluido:       { label: 'Fluído do radiador/reservatório',       tipo: 'alteracao' },
        oleo:         { label: 'Nível de óleo (motor/freio/hidr.)',     tipo: 'alteracao' },
        vidros:       { label: 'Vidros',                                tipo: 'alteracao' },
        retrovisores: { label: 'Retrovisores',                          tipo: 'alteracao' },
        carroceria:   { label: 'Carroceria (capô/portas/parachoques)',  tipo: 'alteracao' },
        pneus:        { label: 'Pneus e estepe',                        tipo: 'alteracao' },
        estofados:    { label: 'Estofados, forração e tapetes',         tipo: 'alteracao' },
        limpadores:   { label: 'Limpadores',                            tipo: 'alteracao' },
        radio:        { label: 'Rádio Comunicador',                     tipo: 'alteracao' },
        capsula:      { label: 'Cápsula de retenção',                   tipo: 'alteracao' },
    };

    // Campos NÃO exibidos no checklist (são exibidos em outras seções)
    const EXCLUIDOS = new Set([
        'id','prefixo','placa','dataHora','motorista','posto','matricula',
        'guarnicao','combustivel','km','km_inicial','km_final',
        'observacoes','obs','assinatura',
        'criadoEm','criadoPor','updatedAt','updatedBy','usuario',
        'cpf','nomeCivil','nomeGuerra',
    ]);

    // ================================================================
    // INIT
    // ================================================================
    document.addEventListener('DOMContentLoaded', () => {
        atualizarRelogio();
        setInterval(atualizarRelogio, 1000);
        const usuario = localStorage.getItem('frota_usuario');
        if (usuario) {
            document.getElementById('user-info').innerHTML =
                `<p>Usuário:</p><p class="user-nome">${usuario}</p>`;
        }
        carregarVistorias();
    });

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
            const dados = await fb_get('vistorias');
            if (!dados) {
                tabela.innerHTML = vazio('Nenhuma vistoria encontrada.');
                return;
            }
            vistoriasCache = Object.keys(dados)
                .map(id => ({ id, ...dados[id] }))
                .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));
            exibirDados(vistoriasCache);
        } catch (e) {
            console.error(e);
            tabela.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--danger)">
                Erro ao carregar dados. Verifique a conexão.</td></tr>`;
        }
    }

    function vazio(msg) {
        return `<tr><td colspan="8" style="text-align:center;padding:36px;color:#aaa">
            <span class="material-icons" style="font-size:2rem;display:block;margin-bottom:8px;color:#ddd">search_off</span>
            ${msg}</td></tr>`;
    }

    // ================================================================
    // EXIBIR TABELA
    // ================================================================
    function exibirDados(lista) {
        const tabela = document.getElementById('tabela-vistorias');
        if (!lista.length) {
            tabela.innerHTML = vazio('Nenhuma vistoria encontrada.');
            document.getElementById('contador-registros').textContent = '0 registros';
            return;
        }
        tabela.innerHTML = lista.map(v => {
            const dataObj = new Date(v.dataHora);
            const dataF   = isNaN(dataObj) ? (v.dataHora || '—') : dataObj.toLocaleDateString('pt-BR');
            const horaF   = isNaN(dataObj) ? '—' : dataObj.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
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
                    <button class="btn-acao btn-relatorio"
                        onclick="abrirRelatorio('${v.id}')"
                        title="Ver relatório completo">
                        <span class="material-icons">description</span>
                        Relatório
                    </button>
                    <button class="btn-acao btn-deletar"
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
        const termo   = document.getElementById('busca').value.toLowerCase();
        const periodo = document.getElementById('filtro-periodo').value;
        const agora   = new Date();

        let filtrados = vistoriasCache.filter(v => {
            const haystack = `${v.motorista||''} ${v.prefixo||''} ${v.placa||''} ${v.matricula||''} ${v.posto||''} ${v.guarnicao||''}`.toLowerCase();
            return haystack.includes(termo);
        });

        if (periodo) {
            filtrados = filtrados.filter(v => {
                const d = new Date(v.dataHora);
                if (isNaN(d)) return false;
                if (periodo === 'hoje') {
                    return d.toDateString() === agora.toDateString();
                }
                if (periodo === 'semana') {
                    return (agora - d) <= 7 * 86400000;
                }
                if (periodo === 'mes') {
                    return (agora - d) <= 30 * 86400000;
                }
                return true;
            });
        }

        exibirDados(filtrados);
    }

    // ================================================================
    // MODAL — RELATÓRIO COMPLETO
    // ================================================================
    function abrirRelatorio(id) {
        const v = vistoriasCache.find(x => x.id === id);
        if (!v) return;

        const dataObj = new Date(v.dataHora);
        const dataF   = isNaN(dataObj) ? (v.dataHora || '—')
            : dataObj.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
        const horaF   = isNaN(dataObj) ? '—'
            : dataObj.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const dataSimples = isNaN(dataObj) ? '—' : dataObj.toLocaleDateString('pt-BR');

        // Número do relatório (usa os últimos 6 chars do id Firebase)
        document.getElementById('rel-num-doc').textContent = `Nº ${id.slice(-6).toUpperCase()}`;

        // Faixa de identificação
        document.getElementById('rel-placa').textContent    = v.placa    || '—';
        document.getElementById('rel-prefixo').textContent  = v.prefixo  || '—';
        document.getElementById('rel-guarnicao').textContent = v.guarnicao ? `Guarnição: ${v.guarnicao}` : '';
        document.getElementById('rel-data').textContent     = dataF;
        document.getElementById('rel-hora').textContent     = `🕐 ${horaF}`;

        // Seção condutor
        document.getElementById('rel-grid-condutor').innerHTML = montarGrid([
            ['Nome do Motorista',  v.motorista],
            ['Posto / Graduação',  v.posto],
            ['Matrícula',          v.matricula],
            ['Guarnição',          v.guarnicao],
        ]);

        // Seção viatura
        document.getElementById('rel-grid-viatura').innerHTML = montarGrid([
            ['Prefixo',            v.prefixo],
            ['Placa',              v.placa],
            ['Nível de Combustível', v.combustivel],
            ['Odômetro (KM)',       v.km     ? Number(v.km).toLocaleString('pt-BR') + ' km'     : null],
            ['KM Inicial',         v.km_inicial ? Number(v.km_inicial).toLocaleString('pt-BR') + ' km' : null],
            ['KM Final',           v.km_final   ? Number(v.km_final).toLocaleString('pt-BR')   + ' km' : null],
            ['Data da Vistoria',   dataSimples],
            ['Hora da Vistoria',   horaF],
        ]);

        // Checklist
        const items = [];
        // Primeiro, itens mapeados em CHECKLIST_MAP
        for (const [chave, cfg] of Object.entries(CHECKLIST_MAP)) {
            if (v[chave] === undefined || v[chave] === null || v[chave] === '') continue;
            const valor    = String(v[chave]).trim();
            const valorObs = v[`${chave}_outro`] ? String(v[`${chave}_outro`]).trim() : '';
            const status   = avaliarItem(valor, cfg.tipo);
            items.push({ label: cfg.label, valor, valorObs, status });
        }
        // Depois, quaisquer outros campos booleanos/texto não mapeados
        for (const [chave, valor] of Object.entries(v)) {
            if (EXCLUIDOS.has(chave)) continue;
            if (CHECKLIST_MAP[chave]) continue;
            if (chave.endsWith('_outro')) continue; // já tratado acima
            if (valor === null || valor === undefined || valor === '') continue;
            const status = avaliarItem(String(valor), 'alteracao');
            items.push({ label: chaveParaLabel(chave), valor: String(valor), valorObs: '', status });
        }

        const secaoCheck = document.getElementById('rel-section-checklist');
        const gridCheck  = document.getElementById('rel-checklist');
        if (items.length) {
            secaoCheck.style.display = '';
            gridCheck.innerHTML = items.map(item => {
                const cls = item.status === 'ok' ? 'check-ok'
                    : item.status === 'nok'      ? 'check-nok'
                    : 'check-neutral';
                const icon = item.status === 'ok' ? 'check_circle'
                    : item.status === 'nok'       ? 'cancel'
                    : 'warning';
                return `
                <div class="check-item ${cls}">
                    <span class="material-icons">${icon}</span>
                    <div>
                        <div class="ci-label">${item.label}</div>
                        <div class="ci-sub">${item.valorObs || item.valor}</div>
                    </div>
                </div>`;
            }).join('');
        } else {
            secaoCheck.style.display = 'none';
        }

        // Observações
        const obs = v.observacoes || v.obs || '';
        document.getElementById('rel-obs').innerHTML = obs
            ? obs.replace(/\n/g, '<br>')
            : '<span class="rel-obs-vazio">Nenhuma observação ou avaria registrada.</span>';

        // Assinatura — suporta eletrônica (objeto) e legado (base64 string)
        const wrap = document.getElementById('rel-assinatura-wrap');
        const ass  = v.assinatura;

        if (ass && typeof ass === 'object' && ass.tipo === 'eletronica_cpf') {
            // ── Assinatura eletrônica via CPF ──
            const cpfF = ass.cpf
                ? ass.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                : '—';
            const horaAss = ass.horaConfirmacaoF || (ass.horaConfirmacao
                ? new Date(ass.horaConfirmacao).toLocaleString('pt-BR') : '—');
            wrap.innerHTML = `
                <div style="background:#f0fff4;border:1.5px solid #28a745;border-radius:8px;padding:12px 16px">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                        <span class="material-icons" style="color:#28a745;font-size:1.3rem">verified_user</span>
                        <strong style="font-size:.88rem;color:#155724">Assinatura Eletrônica Confirmada</strong>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.82rem">
                        <div><span style="color:#888;font-size:.7rem;text-transform:uppercase;display:block">Nome Completo</span>
                             <strong>${ass.nomeCivil || ass.nomeGuerra || '—'}</strong></div>
                        <div><span style="color:#888;font-size:.7rem;text-transform:uppercase;display:block">Graduação</span>
                             <strong>${ass.posto || '—'}</strong></div>
                        <div><span style="color:#888;font-size:.7rem;text-transform:uppercase;display:block">Matrícula</span>
                             <strong>${ass.matricula || '—'}</strong></div>
                        <div><span style="color:#888;font-size:.7rem;text-transform:uppercase;display:block">CPF</span>
                             <strong>${cpfF}</strong></div>
                    </div>
                    <div style="margin-top:8px;font-size:.72rem;color:#28a745">
                        ✅ Confirmado em: ${horaAss}
                    </div>
                </div>`;
        } else if (ass && typeof ass === 'string' && ass.startsWith('data:')) {
            // ── Assinatura canvas legado ──
            wrap.innerHTML = `<img src="${ass}" alt="Assinatura do condutor" style="max-height:130px;border-radius:4px">`;
        } else {
            wrap.innerHTML = `
                <div class="assinatura-vazia">
                    <span class="material-icons">draw</span>
                    Assinatura não disponível para este registro.
                </div>`;
        }

        // Nome/matrícula abaixo da assinatura — usa dados da assinatura se disponíveis
        const nomeAss = (ass && ass.nomeCivil) ? ass.nomeCivil
                      : (ass && ass.nomeGuerra) ? ass.nomeGuerra
                      : (v.motorista || '—');
        const postoAss = (ass && ass.posto) ? ass.posto + ' ' : '';
        const matAss   = (ass && ass.matricula) ? ass.matricula : (v.matricula || '—');

        document.getElementById('rel-ass-nome').textContent = postoAss + nomeAss;
        document.getElementById('rel-ass-mat').textContent  = matAss;
        document.getElementById('rel-ass-data').textContent = `Registrado em: ${dataSimples} às ${horaF}`;

        document.getElementById('modal-relatorio').classList.add('open');
    }

    function avaliarItem(valor, tipo) {
        const v = valor.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
        if (tipo === 'alteracao') {
            if (v === 'sem alteracao') return 'ok';
            if (v === 'com alteracao' || v === 'outro') return 'nok';
            return 'neutral';
        }
        if (tipo === 'condicao') {
            if (v === 'otimo' || v === 'bom') return 'ok';
            if (v === 'regular') return 'neutral';
            return 'nok';
        }
        return 'neutral';
    }

    function chaveParaLabel(chave) {
        return chave
            .replace(/_/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    function montarGrid(pares) {
        const html = pares
            .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '—')
            .map(([label, valor]) => `
                <div class="rel-campo">
                    <div class="rc-label">${label}</div>
                    <div class="rc-valor">${valor}</div>
                </div>`)
            .join('');
        return html || '<div style="color:#aaa;font-size:.82rem;padding:8px">Sem dados registrados.</div>';
    }

    function fecharRelatorio() {
        document.getElementById('modal-relatorio').classList.remove('open');
    }

    function imprimirRelatorio() {
        window.print();
    }

    // ================================================================
    // EXCLUSÃO
    // ================================================================
    function pedirConfirmacaoDel(id) {
        const v = vistoriasCache.find(x => x.id === id);
        if (!v) return;
        _idParaExcluir = id;
        const dataObj = new Date(v.dataHora);
        const dataF   = isNaN(dataObj) ? (v.dataHora || '—') : dataObj.toLocaleDateString('pt-BR');
        document.getElementById('del-prefixo-label').textContent   = v.prefixo   || v.placa || '—';
        document.getElementById('del-data-label').textContent      = dataF;
        document.getElementById('del-motorista-label').textContent = v.motorista  || '—';
        document.getElementById('modal-confirmar-del').classList.add('open');
    }

    function fecharConfirmacaoDel() {
        document.getElementById('modal-confirmar-del').classList.remove('open');
        _idParaExcluir = null;
    }

    async function confirmarExclusao() {
        if (!_idParaExcluir) return;
        const btn = document.getElementById('btn-confirmar-del');
        btn.disabled    = true;
        btn.textContent = 'Excluindo...';
        try {
            const resp = await fb_delete('vistorias', _idParaExcluir);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            vistoriasCache = vistoriasCache.filter(x => x.id !== _idParaExcluir);
            exibirDados(vistoriasCache);
            fecharConfirmacaoDel();
        } catch (e) {
            console.error(e);
            alert('Erro ao excluir. Verifique a conexão com o Firebase.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons" style="font-size:1rem;vertical-align:middle;margin-right:4px">delete_forever</span> Sim, excluir';
        }
    }

    // ================================================================
    // FECHAR MODAIS AO CLICAR NO OVERLAY
    // ================================================================
    document.getElementById('modal-relatorio').addEventListener('click', function(e) {
        if (e.target === this) fecharRelatorio();
    });
    document.getElementById('modal-confirmar-del').addEventListener('click', function(e) {
        if (e.target === this) fecharConfirmacaoDel();
    });
