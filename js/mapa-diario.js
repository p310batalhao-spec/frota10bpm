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
                select.innerHTML = '<option value="">Selecione a Viatura...</option>';
                if (dados) {
                    viaturasCache = dados;
                    Object.keys(dados).forEach(id => {
                        const v = dados[id];
                        select.innerHTML += `<option value="${id}">${v.prefixo} - ${v.placa} (${v.modelo})</option>`;
                    });
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
                dataAgendamento: dataAgendamento, // data em que aparece para vistoria
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
                const r = await fetch(`${FB_URL}/mapa_diario.json`);
                const dados = await r.json();
                if (dados) {
                    // Converte o objeto do Firebase em Array incluindo o ID (chave)
                    const listaComIds = Object.keys(dados).map(key => ({
                        id: key,
                        ...dados[key]
                    })).reverse();
                    renderizarLinhasTabela(listaComIds);
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
                const r = await fetch(`${FB_URL}/mapa_diario.json`);
                const dados = await r.json();

                if (dados) {
                    const dInicio = new Date(dataInicio + "T00:00:00");
                    const dFim = new Date(dataFim + "T23:59:59");

                    const listaFiltrada = Object.keys(dados).map(key => ({
                        id: key,
                        ...dados[key]
                    })).filter(item => {
                        // Filtra por dataAgendamento (data de disponibilidade para vistoria)
                        // Se não houver, usa a data de dataHora como fallback
                        let dataRef;
                        if (item.dataAgendamento) {
                            dataRef = new Date(item.dataAgendamento + 'T00:00:00');
                        } else if (item.dataHora) {
                            dataRef = new Date(item.dataHora.substring(0,10) + 'T00:00:00');
                        } else {
                            return false;
                        }
                        return dataRef >= dInicio && dataRef <= dFim;
                    }).reverse();

                    if (listaFiltrada.length === 0) {
                        document.getElementById('tabela-mapa').innerHTML = '<tr><td colspan="6" style="text-align:center">Nenhum registro encontrado neste período.</td></tr>';
                    } else {
                        renderizarLinhasTabela(listaFiltrada);
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
        function renderizarLinhasTabela(lista) {
            const corpo = document.getElementById('tabela-mapa');
            corpo.innerHTML = '';
            const hoje = hojeISO();
            lista.forEach(item => {
                const data = new Date(item.dataHora).toLocaleString('pt-BR');
                const agendada = item.dataAgendamento || item.dataHora?.substring(0,10) || '—';
                // Formata data agendada em pt-BR
                const agendadaExib = agendada !== '—'
                    ? agendada.split('-').reverse().join('/')
                    : '—';
                const isHoje = agendada === hoje;
                const isFutura = agendada > hoje;
                const badgeColor = isFutura ? '#e67e22' : (isHoje ? '#28a745' : '#6c757d');
                const badgeLabel = isFutura ? 'Agendada' : (isHoje ? 'Hoje' : 'Encerrada');
                corpo.innerHTML += `
            <tr>
                <td><span class="tag-guarnicao">${item.guarnicao}</span></td>
                <td><strong>${item.prefixo}</strong> - ${item.modelo}</td>
                <td>${item.placa}</td>
                <td>${data}</td>
                <td>
                    <span style="display:inline-block;background:${badgeColor};color:white;padding:2px 7px;border-radius:4px;font-size:0.75rem;font-weight:bold;margin-bottom:3px">${badgeLabel}</span><br>
                    <span style="font-size:0.85rem">${agendadaExib}</span>
                </td>
                <td>${item.criadoPor}</td>
                <td class="no-print" style="text-align:center">
                    <button onclick="deletarLancamento('${item.id}')" style="background:none; border:none; color:var(--cor-danger); cursor:pointer;">
                        <span class="material-icons">delete</span>
                    </button>
                </td>
            </tr>`; 
            });
        }
