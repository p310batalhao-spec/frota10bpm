const FB_URL = 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';
        let viaturasCache = {};
 
        function hojeISO() {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }
 
        // Funções de Inicialização
        window.onload = () => {
            verificarSessao();
            setInterval(atualizarRelogio, 1000);
            carregarViaturas();
            carregarMapa(); // Carrega os dados ao abrir, mas você pode usar resetarTela() se quiser iniciar vazio
        };
 
        function verificarSessao() {
            const user = localStorage.getItem('frota_usuario');
            if (!user) { window.location.href = 'login.html'; }
            document.getElementById('user-info').textContent = `Olá, ${user}`;
        }
 
        function atualizarRelogio() {
            const agora = new Date();
            document.getElementById('relogio').textContent = agora.toLocaleString('pt-BR');
        }
 
        function logout() {
            localStorage.removeItem('frota_usuario');
            window.location.href = 'login.html';
        }
 
        function mostrarMsg(texto, tipo) {
            const el = document.getElementById('msg-feedback');
            el.textContent = texto;
            el.style.display = 'block';
            el.style.backgroundColor = tipo === 'ok' ? 'var(--cor-success)' : 'var(--cor-danger)';
            setTimeout(() => el.style.display = 'none', 3000);
        }
 
        async function carregarViaturas() {
            try {
                const r = await fetch(`${FB_URL}/viaturas.json`);
                const dados = await r.json();
                const select = document.getElementById('m-viatura');
                if (dados) {
                    viaturasCache = dados;
                    // Array + join: evita N refluxos no DOM ao popular o select
                    const opts = Object.keys(dados).map(id => {
                        const v = dados[id];
                        return `<option value="${id}">${v.prefixo} - ${v.placa} (${v.modelo})</option>`;
                    });
                    select.innerHTML = '<option value="">Selecione a Viatura...</option>' + opts.join('');
                }
            } catch (e) { console.error(e); }
        }
 
        async function salvarNoMapa() {
            const guarnicao = document.getElementById('m-guarnicao').value;
            const vId = document.getElementById('m-viatura').value;
 
            if (!guarnicao || !vId) {
                mostrarMsg("Preencha todos os campos!", "erro");
                return;
            }
 
            const v = viaturasCache[vId];
 
            // Data de agendamento: se informada, usa ela; caso contrário usa hoje
            const dataAgendamentoInput = document.getElementById('m-data-agendamento').value;
            const dataAgendamento = dataAgendamentoInput || hojeISO();
 
            const dadosMapa = {
                guarnicao,
                prefixo: v.prefixo,
                placa: v.placa,
                modelo: v.modelo,
                dataHora: new Date().toISOString(),
                // dataAgendamento: janela de 24h a partir de 00:00 desta data.
                // Se nao agendada, usa a data de hoje (fica disponivel o dia inteiro).
                dataAgendamento: dataAgendamento,
                responsavel: localStorage.getItem('frota_usuario'),
                criadoPor: localStorage.getItem('frota_usuario')
            };
 
            try {
                await fetch(`${FB_URL}/mapa_diario.json`, { method: 'POST', body: JSON.stringify(dadosMapa) });
                mostrarMsg("Lançamento concluído!", "ok");
                carregarMapa();
            } catch (e) { mostrarMsg("Erro ao salvar.", "erro"); }
        }
 
        // ================================================================
        // CARREGAR MAPA (ATUALIZADO)
        // ================================================================
        async function carregarMapa() {
            try {
                const [rMapa, rVist] = await Promise.all([
                    fetch(`${FB_URL}/mapa_diario.json`),
                    fetch(`${FB_URL}/vistorias.json`)
                ]);
                const dados     = await rMapa.json();
                const vistorias = await rVist.json();
                if (dados) {
                    const listaComIds = Object.keys(dados).map(key => ({
                        id: key,
                        ...dados[key]
                    })).filter(item => {
                        // Filtra últimos 7 dias: evita renderizar 84+ registros antigos
                        const limite7d = new Date();
                        limite7d.setDate(limite7d.getDate() - 7);
                        const ref = item.dataAgendamento
                            ? new Date(item.dataAgendamento + 'T00:00:00')
                            : new Date(item.dataHora);
                        return ref >= limite7d;
                    }).reverse()
                    renderizarLinhasTabela(listaComIds, vistorias || {});
                } else {
                    document.getElementById('tabela-mapa').innerHTML = '';
                }
            } catch (e) { console.error(e); }
        }
 
        // ================================================================
        // FILTRAR POR PERÍODO
        // ================================================================
        async function filtrarMapa() {
            const dataInicio = document.getElementById('filtro-data-inicio').value;
            const dataFim = document.getElementById('filtro-data-fim').value;
 
            if (!dataInicio || !dataFim) {
                mostrarMsg("Selecione o período (Início e Fim) para buscar.", "erro");
                return;
            }
 
            try {
                const [rMapa, rVist] = await Promise.all([
                    fetch(`${FB_URL}/mapa_diario.json`),
                    fetch(`${FB_URL}/vistorias.json`)
                ]);
                const dados     = await rMapa.json();
                const vistorias = await rVist.json();
 
                if (dados) {
                    const dInicio = new Date(dataInicio + "T00:00:00");
                    const dFim = new Date(dataFim + "T23:59:59");
 
                    const listaFiltrada = Object.keys(dados).map(key => ({
                        id: key,
                        ...dados[key]
                    })).filter(item => {
                        let dataRef;
                        if (item.dataAgendamento) {
                            dataRef = new Date(item.dataAgendamento + 'T00:00:00');
                        } else if (item.dataHora) {
                            const _d = new Date(item.dataHora);
                            dataRef = new Date(`${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}T00:00:00`);
                        } else {
                            return false;
                        }
                        return dataRef >= dInicio && dataRef <= dFim;
                    }).reverse();
 
                    if (listaFiltrada.length === 0) {
                        document.getElementById('tabela-mapa').innerHTML = '<tr><td colspan="6" style="text-align:center">Nenhum registro encontrado neste periodo.</td></tr>';
                    } else {
                        renderizarLinhasTabela(listaFiltrada, vistorias || {});
                    }
                    mostrarMsg(`Busca concluída: ${listaFiltrada.length} registros.`, "ok");
                }
            } catch (e) {
                console.error(e);
                mostrarMsg("Erro ao consultar histórico.", "erro");
            }
        }
 
        // ================================================================
        // RESETAR TELA (LIMPA APENAS A EXIBIÇÃO)
        // ================================================================
        function resetarTela() {
            document.getElementById('filtro-data-inicio').value = '';
            document.getElementById('filtro-data-fim').value = '';
            document.getElementById('tabela-mapa').innerHTML = '';
            mostrarMsg("Exibição limpa. Dados preservados no banco.", "ok");
        }
 
        // ================================================================
        // DELETAR LANÇAMENTO (REMOVE DO FIREBASE)
        // ================================================================
        async function deletarLancamento(id) {
            if (!confirm("Deseja realmente excluir este lançamento permanentemente?")) return;
 
            try {
                const response = await fetch(`${FB_URL}/mapa_diario/${id}.json`, { method: 'DELETE' });
                if (response.ok) {
                    mostrarMsg("Registro removido com sucesso!", "ok");
                    // Verifica se há filtro ativo para atualizar a lista corretamente
                    const dInicio = document.getElementById('filtro-data-inicio').value;
                    if (dInicio) { filtrarMapa(); } else { carregarMapa(); }
                }
            } catch (e) {
                mostrarMsg("Erro ao deletar registro.", "erro");
            }
        }
 
        // ================================================================
        // RENDERIZAR LINHAS (AUXILIAR COM BOTÃO DELETAR)
        // ================================================================
        function renderizarLinhasTabela(lista, vistorias) {
            const corpo = document.getElementById('tabela-mapa');
            corpo.innerHTML = '';
            const hoje = hojeISO();
 
            // Monta set de lançamentos já vistoriados (por mapaId ou PREFIXO|PLACA legado)
            const vistoriadosMap = {}; // chave -> dados da vistoria (para exibir motorista)
            if (vistorias) {
                Object.values(vistorias).forEach(v => {
                    const chave = v.mapaId || `${(v.prefixo||'').trim()}|${(v.placa||'').trim()}`;
                    if (chave && !vistoriadosMap[chave]) {
                        vistoriadosMap[chave] = v;
                    }
                });
            }
 
            const linhas = [];
            lista.forEach(item => {
                const data     = new Date(item.dataHora).toLocaleString('pt-BR');
                // Usa data local para evitar bug de fuso (ISO UTC pode virar amanhã após 21h BRT)
                const dtLocal  = new Date(item.dataHora);
                const dataLocalISO = `${dtLocal.getFullYear()}-${String(dtLocal.getMonth()+1).padStart(2,'0')}-${String(dtLocal.getDate()).padStart(2,'0')}`;
                const agendada = item.dataAgendamento || dataLocalISO || '--';
                const agendadaExib = agendada !== '--'
                    ? agendada.split('-').reverse().join('/')
                    : '--';
 
                const isHoje    = agendada === hoje;
                const isFutura  = agendada > hoje;
 
                // Verifica se este lançamento já foi vistoriado
                // Para fallback PREFIXO|PLACA: só conta como vistoriado se a vistoria
                // foi feita no mesmo dia do agendamento (evita marcar lançamentos
                // futuros da mesma viatura como vistoriados)
                const chaveLeg   = `${(item.prefixo||'').trim()}|${(item.placa||'').trim()}`;
                const vistoriaExata = vistoriadosMap[item.id];
                const vistoriaLeg   = vistoriadosMap[chaveLeg];
                // Para legado: só usa se a vistoria foi feita no mesmo dia do lançamento
                // Usa data LOCAL para evitar bug de fuso UTC após 21h BRT
                let vistoriaLegValida = false;
                if (vistoriaLeg && vistoriaLeg.dataHora) {
                    const dv = new Date(vistoriaLeg.dataHora);
                    const dvStr = dv.getFullYear() + '-' + String(dv.getMonth()+1).padStart(2,'0') + '-' + String(dv.getDate()).padStart(2,'0');
                    vistoriaLegValida = dvStr === agendada;
                }
                const vDados     = vistoriaExata || (vistoriaLegValida ? vistoriaLeg : null);
                const vistoriada = !!vDados;
 
                // Badge: Vistoriada > Disponível > Agendada > Encerrada
                let badgeColor, badgeLabel, badgeExtra = '';
                if (vistoriada) {
                    badgeColor = '#1a6b3a';
                    badgeLabel = '✅ Vistoriada';
                    const motorista = vDados.nomeCivil || vDados.motorista || '';
                    if (motorista) badgeExtra = `<br><span style="font-size:0.72rem;color:#555">${motorista}</span>`;
                } else if (isFutura) {
                    badgeColor = '#e67e22';
                    badgeLabel = 'Agendada';
                } else if (isHoje) {
                    badgeColor = '#28a745';
                    badgeLabel = 'Disponivel';
                } else {
                    badgeColor = '#6c757d';
                    badgeLabel = 'Encerrada';
                }
 
                linhas.push(`
            <tr${vistoriada ? ' style="background:rgba(26,107,58,.05)"' : ''}>
                <td><span class="tag-guarnicao">${item.guarnicao}</span></td>
                <td><strong>${item.prefixo}</strong> - ${item.modelo}</td>
                <td>${item.placa}</td>
                <td>${data}</td>
                <td>
                    <span style="display:inline-block;background:${badgeColor};color:white;padding:2px 7px;border-radius:4px;font-size:0.75rem;font-weight:bold;margin-bottom:3px">${badgeLabel}</span>
                    ${badgeExtra}
                    <br><span style="font-size:0.85rem">${agendadaExib}</span>
                </td>
                <td>${item.criadoPor || item.responsavel || '--'}</td>
                <td class="no-print" style="text-align:center">
                    <button onclick="deletarLancamento('${item.id}')" style="background:none; border:none; color:var(--cor-danger); cursor:pointer;">
                        <span class="material-icons">delete</span>
                    </button>
                </td>
            </tr>`)
            });
            corpo.innerHTML = linhas.join(''); // 1 reflow em vez de N
        }
 
        // Garante ocultação da coluna Ações na impressão
        window.addEventListener('beforeprint', function() {
            document.querySelectorAll('.no-print').forEach(el => el.style.display = 'none');
        });
        window.addEventListener('afterprint', function() {
            document.querySelectorAll('.no-print').forEach(el => el.style.display = '');
        });
        // ================================================================
        // FILTRO LOCAL DA TABELA (sem nova busca no Firebase)
        // Filtra as linhas já renderizadas por guarnição, viatura/placa e status
        // ================================================================
        function filtrarTabelaLocal() {
            const txtGuarnicao = (document.getElementById('filtro-guarnicao')?.value || '').toLowerCase().trim();
            const txtViatura   = (document.getElementById('filtro-viatura')?.value   || '').toLowerCase().trim();
            const status       = (document.getElementById('filtro-status-vistoria')?.value || '').toLowerCase().trim();
 
            const linhas = document.querySelectorAll('#tabela-mapa tr');
            let visiveis = 0;
 
            linhas.forEach(tr => {
                const cells = tr.querySelectorAll('td');
                if (cells.length < 4) { tr.style.display = ''; return; }
 
                const guarnicao = (cells[0].textContent || '').toLowerCase();
                const viatura   = (cells[1].textContent || '').toLowerCase();
                const placa     = (cells[2].textContent || '').toLowerCase();
                // Badge de status fica na coluna 4 (índice 4)
                const badgeEl   = cells[4]?.querySelector('span[style*="border-radius"]');
                const badgeText = (badgeEl?.textContent || '').toLowerCase().trim();
 
                const okGuarnicao = !txtGuarnicao || guarnicao.includes(txtGuarnicao);
                const okViatura   = !txtViatura   || viatura.includes(txtViatura) || placa.includes(txtViatura);
                const okStatus    = !status        || badgeText.includes(status.toLowerCase());
 
                if (okGuarnicao && okViatura && okStatus) {
                    tr.style.display = '';
                    visiveis++;
                } else {
                    tr.style.display = 'none';
                }
            });
 
            const contador = document.getElementById('contador-filtro');
            if (contador) {
                const total = linhas.length;
                contador.textContent = (txtGuarnicao || txtViatura || status)
                    ? `${visiveis} de ${total} registro(s)`
                    : '';
            }
        }
 
        function limparFiltrosTabela() {
            const g = document.getElementById('filtro-guarnicao');
            const v = document.getElementById('filtro-viatura');
            const s = document.getElementById('filtro-status-vistoria');
            if (g) g.value = '';
            if (v) v.value = '';
            if (s) s.value = '';
            filtrarTabelaLocal();
        }