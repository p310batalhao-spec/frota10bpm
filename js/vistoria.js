const FB_URL = 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';

        // ================================================================
        // BUSCA DE MOTORISTA POR CPF
        // ================================================================
        let motoristaAtual = null; // objeto do motorista encontrado
        let assinaturaConfirmada = false;
        let assinaturaDados = null; // { nomeCivil, posto, matricula, cpf, horaConfirmacao }

        function formatarCPF(input) {
            let v = input.value.replace(/\D/g,'');
            if (v.length > 3)  v = v.substring(0,3) + '.' + v.substring(3);
            if (v.length > 7)  v = v.substring(0,7) + '.' + v.substring(7);
            if (v.length > 11) v = v.substring(0,11) + '-' + v.substring(11);
            input.value = v.substring(0,14);
        }

        async function buscarMotoristaPorCPF() {
            const cpfDigitado = document.getElementById('v-cpf').value.replace(/\D/g,'');
            const statusEl = document.getElementById('v-cpf-status');

            if (cpfDigitado.length < 11) {
                statusEl.style.color = '#888';
                statusEl.textContent = cpfDigitado.length > 0 ? `⏳ ${cpfDigitado.length}/11 dígitos...` : '';
                return;
            }

            const cpfRaw = cpfDigitado.padStart(11, '0');
            statusEl.style.color = '#555';
            statusEl.textContent = '🔎 Buscando...';

            try {
                const dados = await fetch(`${FB_URL}/motoristas.json`).then(r => r.json());
                if (!dados) {
                    statusEl.style.color = 'red';
                    statusEl.textContent = '⚠️ Nenhum motorista cadastrado.';
                    return;
                }

                const normCPF = v => String(v ?? '').replace(/\D/g,'').padStart(11, '0');

                const encontrado = Object.entries(dados).find(([, m]) => {
                    const cpfBanco = normCPF(m.cpf ?? '');
                    return cpfBanco !== '00000000000' && cpfBanco === normCPF(cpfRaw);
                });

                if (!encontrado) {
                    const total = Object.keys(dados).length;
                    const amostra = Object.values(dados).slice(0,5).map(m => normCPF(m.cpf ?? '—'));
                    console.warn(`[Vistoria] CPF buscado: "${normCPF(cpfRaw)}" | Total: ${total} | Amostra: ${amostra.join(', ')}`);
                    statusEl.style.color = '#dc3545';
                    statusEl.textContent = `❌ CPF não encontrado entre ${total} motoristas. Veja console (F12) para diagnóstico.`;
                    motoristaAtual = null;
                    return;
                }

                const [id, m] = encontrado;
                // Preserva o _mapaId que foi setado pelo abrirVistoria
                // (o usuário pode buscar o CPF depois de abrir o modal)
                const mapaIdSalvo = motoristaAtual?._mapaId || null;
                motoristaAtual = { id, ...m, _mapaId: mapaIdSalvo };

                document.getElementById('v-posto').value          = m.posto      || '';
                document.getElementById('v-matricula').value      = m.matricula  || '';
                document.getElementById('v-motorista').value      = m.nomeCivil  || m.nomeGuerra || m.nome || m.Nome || '';
                document.getElementById('v-motorista-id').value   = id;
                document.getElementById('v-cpf-confirmado').value = cpfRaw;
                document.getElementById('ass-cpf').value          = document.getElementById('v-cpf').value;

                statusEl.style.color = '#28a745';
                statusEl.textContent = `✅ ${m.posto || ''} ${m.nomeCivil || m.nomeGuerra || ''} — Mat: ${m.matricula || '—'}`;

                resetarAssinatura();

            } catch(e) {
                console.error('Erro buscarMotoristaPorCPF:', e);
                statusEl.style.color = 'red';
                statusEl.textContent = 'Erro ao buscar. Verifique a conexão com o Firebase.';
            }
        }

        function limparCamposCondutor() {
            ['v-posto','v-matricula','v-motorista','v-motorista-id','v-cpf-confirmado'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            motoristaAtual = null;
            resetarAssinatura();
        }

        // ================================================================
        // ASSINATURA ELETRÔNICA VIA CPF + SENHA
        // ================================================================
        function resetarAssinatura() {
            assinaturaConfirmada = false;
            assinaturaDados = null;
            document.getElementById('assinatura-confirmada').style.display = 'none';
            document.getElementById('ass-msg').textContent = '';
            document.getElementById('ass-senha').value = '';
        }

        async function confirmarAssinaturaEletronica() {
            const cpfAss   = document.getElementById('ass-cpf').value.replace(/\D/g,'').padStart(11,'0');
            const senhaAss = document.getElementById('ass-senha').value.replace(/\D/g,'').padStart(11,'0');
            const msgEl    = document.getElementById('ass-msg');

            if (!cpfAss || cpfAss.length < 11) {
                msgEl.style.color = '#dc3545';
                msgEl.textContent = '⚠️ Informe o CPF completo.';
                return;
            }
            if (!senhaAss || senhaAss.length < 11) {
                msgEl.style.color = '#dc3545';
                msgEl.textContent = '⚠️ Confirme o CPF no campo de senha.';
                return;
            }
            if (cpfAss !== senhaAss) {
                msgEl.style.color = '#dc3545';
                msgEl.textContent = '⚠️ CPF e confirmação não coincidem.';
                return;
            }

            const cpfCondutor = document.getElementById('v-cpf-confirmado').value.replace(/\D/g,'').padStart(11,'0');
            if (cpfCondutor && cpfAss !== cpfCondutor) {
                msgEl.style.color = '#dc3545';
                msgEl.textContent = '⚠️ CPF da assinatura diferente do CPF do condutor identificado.';
                return;
            }

            msgEl.style.color = '#555';
            msgEl.textContent = '🔎 Verificando...';

            try {
                const normCPF = v => String(v || '').replace(/\D/g,'').padStart(11,'0');

                if (!motoristaAtual) {
                    msgEl.style.color = '#dc3545';
                    msgEl.textContent = '⚠️ Identifique o condutor pelo CPF antes de assinar.';
                    return;
                }

                if (normCPF(motoristaAtual.cpf) !== normCPF(cpfAss)) {
                    msgEl.style.color = '#dc3545';
                    msgEl.textContent = '❌ CPF não corresponde ao condutor identificado.';
                    assinaturaConfirmada = false;
                    return;
                }

                const agora   = new Date();
                const horaStr = agora.toLocaleString('pt-BR');
                const m       = motoristaAtual;

                assinaturaDados = {
                    nomeCivil:        m.nomeCivil  || m.nomeGuerra || '',
                    nomeGuerra:       m.nomeGuerra || '',
                    posto:            m.posto      || '',
                    matricula:        m.matricula  || '',
                    cpf:              cpfAss,
                    horaConfirmacao:  agora.toISOString(),
                    horaConfirmacaoF: horaStr,
                };

                assinaturaConfirmada = true;

                const nomeFull = `${assinaturaDados.posto} ${assinaturaDados.nomeCivil || assinaturaDados.nomeGuerra}`.trim();
                document.getElementById('ass-nome-exibido').textContent = nomeFull;
                document.getElementById('ass-dados-exibidos').textContent =
                    `Matrícula: ${assinaturaDados.matricula} | CPF: ${cpfAss.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4')}`;
                document.getElementById('ass-hora-confirmacao').textContent = horaStr;
                document.getElementById('assinatura-confirmada').style.display = 'block';

                msgEl.style.color = '#28a745';
                msgEl.textContent = '✅ Identidade confirmada com sucesso!';
                document.getElementById('ass-senha').value = '';

            } catch(e) {
                console.error(e);
                msgEl.style.color = 'red';
                msgEl.textContent = 'Erro ao verificar. Verifique a conexão.';
            }
        }

        // ── Utilitário: retorna a data de hoje no formato AAAA-MM-DD (fuso local) ──
        function hojeISO() {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }

        window.onload = () => {
            carregarMapaDoDia();
        };

        // ================================================================
        // REGRA DE VISIBILIDADE
        //
        // Só aparecem lançamentos cuja data de referência seja HOJE:
        //
        // Lançamento COM agendamento (dataAgendamento):
        //   data de referência = dataAgendamento.
        //   Visível das 00:00 às 09:00 do dia seguinte.
        //
        // Lançamento SEM agendamento:
        //   data de referência = data local do dataHora.
        //   Visível a partir do momento do lançamento até às 09:00
        //   do dia seguinte.
        //
        // Se a data de referência não for hoje, o item não aparece.
        // ================================================================
        function dentroJanelaVisibilidade(item) {
            // Regra: aparece APENAS no dia de agendamento (00:00 até 23:59).
            // Após meia-noite do dia seguinte, some automaticamente.
            const hoje = hojeISO();

            if (item.dataAgendamento) {
                // Com agendamento: visível somente no dia agendado
                return item.dataAgendamento === hoje;
            } else {
                // Sem agendamento: visível somente no dia em que foi lançado
                // Usa data LOCAL (getDate) para evitar bug de fuso UTC após 21h BRT
                const d = new Date(item.dataHora);
                const dataLanc = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                return dataLanc === hoje;
            }
        }

        async function carregarMapaDoDia() {
            const corpo = document.getElementById('tabela-mapa');
            corpo.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#aaa">Carregando...</td></tr>';

            try {
                // ── 1. Busca mapa e vistorias em paralelo ──
                const [rMapa, rVist] = await Promise.all([
                    fetch(`${FB_URL}/mapa_diario.json`),
                    fetch(`${FB_URL}/vistorias.json`)
                ]);

                const dadosMapa      = await rMapa.json();
                const dadosVistorias = await rVist.json();

                corpo.innerHTML = '';

                if (!dadosMapa) {
                    corpo.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px">Nenhuma guarnição lançada para hoje.</td></tr>';
                    return;
                }

                // ── 2. Monta o Set de lançamentos já vistoriados ──
                // Usa mapaId como chave exata; fallback PREFIXO|PLACA apenas para
                // vistorias legadas (sem mapaId) registradas hoje.
                const hoje = hojeISO();
                // Mapeia vistorias APENAS por mapaId.
                // O fallback PREFIXO|PLACA foi removido definitivamente — causava
                // falsos positivos bloqueando lançamentos nunca vistoriados.
                // Vistorias sem mapaId (legado) simplesmente não bloqueiam nada.
                const vistoriasPorMapaId = new Set();

                if (dadosVistorias) {
                    Object.values(dadosVistorias).forEach(v => {
                        if (v.mapaId) {
                            vistoriasPorMapaId.add(v.mapaId);
                        }
                    });
                }

                // ── 3. Filtra lançamentos dentro da janela de visibilidade ──
                const todosItens = Object.keys(dadosMapa)
                    .map(id => ({ id, ...dadosMapa[id] }));

                const visiveis = todosItens.filter(item => {
                    if (!item.dataHora) return false;
                    return dentroJanelaVisibilidade(item);
                });

                if (visiveis.length === 0) {
                    corpo.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px">Nenhuma guarnição disponível para vistoria no momento.</td></tr>';
                    return;
                }

                // ── 4. Separa pendentes vs. já vistoriadas ──
                // Prioridade: mapaId exato. Se nao tiver, usa legado PREFIXO|PLACA|DATA.
                // A data na chave legada garante que lancamentos futuros da mesma
                // viatura nao sejam bloqueados por uma vistoria de hoje.
                function foiVistoriado(item) {
                    // Usa exclusivamente mapaId — chave única por lançamento
                    return vistoriasPorMapaId.has(item.id);
                }

                const pendentes  = visiveis.filter(item => !foiVistoriado(item));
                const concluidas = visiveis.filter(item =>  foiVistoriado(item));

                // ── 5. Contador no topo ──
                // Conta vistorias feitas HOJE diretamente no nó /vistorias
                // (independente de o lançamento ainda estar no mapa ou ter sido deletado)
                let vistoriadasHoje = 0;
                if (dadosVistorias) {
                    Object.values(dadosVistorias).forEach(v => {
                        if (!v.dataHora) return;
                        const dv = new Date(v.dataHora);
                        const dataVist = `${dv.getFullYear()}-${String(dv.getMonth()+1).padStart(2,'0')}-${String(dv.getDate()).padStart(2,'0')}`;
                        if (dataVist === hoje) vistoriadasHoje++;
                    });
                }

                const totalMsg = document.querySelector('.instrucao p');
                if (totalMsg) {
                    totalMsg.innerHTML =
                        `Pendentes: <strong>${pendentes.length}</strong> &nbsp;|&nbsp; ` +
                        `Concluídas hoje: <strong style="color:#c8ff9a">${vistoriadasHoje}</strong> &nbsp;|&nbsp; ` +
                        `Total do dia: <strong>${visiveis.length + vistoriadasHoje}</strong>`;
                }

                // ── 6. Renderiza apenas pendentes — vistoriadas saem da tela ──
                if (pendentes.length === 0) {
                    corpo.innerHTML =
                        '<tr><td colspan="5" style="text-align:center;padding:32px">' +
                        '<span class="material-icons" style="font-size:2.5rem;color:#28a745;display:block;margin-bottom:8px">check_circle</span>' +
                        '<strong style="color:#28a745">Todas as viaturas do dia já foram vistoriadas! ✅</strong>' +
                        '</td></tr>';
                    return;
                }

                window._mapaItens = {};
                pendentes.forEach(item => {
                    window._mapaItens[item.id] = item;
                    const dtLanc = item.dataHora
                        ? new Date(item.dataHora).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
                        : '--';
                    corpo.innerHTML += `
                        <tr>
                            <td><strong>${item.guarnicao || '--'}</strong></td>
                            <td>${item.prefixo || '--'}</td>
                            <td>${item.placa   || '--'}</td>
                            <td style="font-size:.78rem;color:#666">${dtLanc}</td>
                            <td>
                                <button class="btn-vistoria"
                                    onclick="abrirVistoriaPorId('${item.id}')">
                                    <span class="material-icons">assignment_turned_in</span> VISTORIAR
                                </button>
                            </td>
                        </tr>`;
                });

            } catch (e) {
                console.error(e);
                document.getElementById('tabela-mapa').innerHTML =
                    '<tr><td colspan="5" style="text-align:center;color:red;padding:20px">Erro ao carregar dados. Verifique a conexão.</td></tr>';
            }
        }

        // ── Abre modal buscando item pelo ID no cache ──
        function abrirVistoriaPorId(id) {
            const item = window._mapaItens && window._mapaItens[id];
            if (!item) {
                console.warn('[Vistoria] Item nao encontrado no cache, recarregando...', id);
                carregarMapaDoDia().then(() => {
                    const retry = window._mapaItens && window._mapaItens[id];
                    if (retry) {
                        abrirVistoria(retry.guarnicao || '', retry.prefixo || '', retry.placa || '', retry.id);
                    } else {
                        mostrarMsg('Erro ao abrir vistoria. Recarregue a página.', 'erro');
                    }
                });
                return;
            }
            abrirVistoria(item.guarnicao || '', item.prefixo || '', item.placa || '', item.id);
        }

        function abrirVistoria(guarnicao, prefixo, placa, mapaId) {
            // Garante que _mapaId fica no objeto mesmo se motoristaAtual
            // for sobrescrito depois pela busca de CPF
            if (!motoristaAtual) motoristaAtual = {};
            motoristaAtual._mapaId = mapaId || null;
            // Guarda também numa variável global independente como segurança
            window._mapaIdAtivo = mapaId || null;
            document.getElementById('v-guarnicao').value = guarnicao;
            document.getElementById('v-prefixo').value   = prefixo;
            document.getElementById('v-placa').value     = placa;
            document.getElementById('modalVistoria').style.display = 'block';
        }

        function fecharModal() {
            document.getElementById('modalVistoria').style.display = 'none';
            document.getElementById('formVistoria').reset();
            motoristaAtual        = null;
            assinaturaConfirmada  = false;
            assinaturaDados       = null;
            window._mapaIdAtivo   = null;
            document.getElementById('v-cpf-status').textContent = '';
            document.getElementById('assinatura-confirmada').style.display = 'none';
            document.getElementById('ass-msg').textContent = '';
        }

        // ── Submit: salva a vistoria ──
        document.getElementById('formVistoria').onsubmit = async (e) => {
            e.preventDefault();

            if (!motoristaAtual) {
                mostrarMsg('⚠️ Identifique o condutor pelo CPF antes de continuar.', 'erro');
                document.getElementById('v-cpf').focus();
                return;
            }

            if (!assinaturaConfirmada || !assinaturaDados) {
                mostrarMsg('⚠️ A assinatura eletrônica é obrigatória! Confirme com CPF e senha.', 'erro');
                document.getElementById('ass-cpf').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled    = true;
            btn.textContent = 'ENVIANDO...';

            const dadosVistoria = {
                prefixo:      document.getElementById('v-prefixo').value,
                placa:        document.getElementById('v-placa').value,
                guarnicao:    document.getElementById('v-guarnicao').value,
                posto:        assinaturaDados.posto     || document.getElementById('v-posto').value,
                matricula:    assinaturaDados.matricula || document.getElementById('v-matricula').value,
                motorista:    assinaturaDados.nomeGuerra,
                nomeCivil:    assinaturaDados.nomeCivil,
                cpf:          assinaturaDados.cpf,
                combustivel:  document.getElementById('v-combustivel').value,
                km:           document.getElementById('v-km').value,
                horaInicio:   document.getElementById('v-hora-inicio').value,
                horaTermino:  document.getElementById('v-hora-termino').value,
                limpeza:      document.getElementById('v-limpeza').value,
                equipamentos: document.getElementById('v-equipamentos').value,
                farois:       document.getElementById('v-farois').value,
                iluminacao:   document.getElementById('v-iluminacao').value,
                ar:           document.getElementById('v-ar').value,
                giroflex:     document.getElementById('v-giroflex').value,
                fluido:       document.getElementById('v-fluido').value,
                oleo:         document.getElementById('v-oleo').value,
                vidros:       document.getElementById('v-vidros').value,
                retrovisores: document.getElementById('v-retrovisores').value,
                carroceria:   document.getElementById('v-carroceria').value,
                pneus:        document.getElementById('v-pneus').value,
                estofados:    document.getElementById('v-estofados').value,
                limpadores:   document.getElementById('v-limpadores').value,
                radio:        document.getElementById('v-rdio').value,
                capsula:      document.getElementById('v-capsula').value,
                observacoes:  document.getElementById('v-obs').value,
                assinatura: {
                    tipo:            'eletronica_cpf',
                    nomeCivil:       assinaturaDados.nomeCivil,
                    nomeGuerra:      assinaturaDados.nomeGuerra,
                    posto:           assinaturaDados.posto,
                    matricula:       assinaturaDados.matricula,
                    cpf:             assinaturaDados.cpf,
                    horaConfirmacao: assinaturaDados.horaConfirmacao,
                },
                dataHora: new Date().toISOString(),
                mapaId:   motoristaAtual?._mapaId || window._mapaIdAtivo || null
            };

            try {
                await fetch(`${FB_URL}/vistorias.json`, {
                    method:  'POST',
                    body:    JSON.stringify(dadosVistoria),
                    headers: { 'Content-Type': 'application/json' }
                });

                mostrarMsg('Vistoria registrada com sucesso! ✅', 'ok');
                fecharModal();
                carregarMapaDoDia();

            } catch (error) {
                console.error(error);
                mostrarMsg('Erro ao salvar vistoria. Tente novamente.', 'erro');
                btn.disabled    = false;
                btn.textContent = 'FINALIZAR VISTORIA E LIBERAR';
            }
        };

        function mostrarMsg(texto, tipo) {
            const el = document.getElementById('msg-feedback');
            el.textContent           = texto;
            el.style.display         = 'block';
            el.style.backgroundColor = tipo === 'ok' ? 'var(--cor-success)' : 'var(--cor-danger)';
            setTimeout(() => el.style.display = 'none', 3500);
        }

        // Fecha modal ao clicar no fundo escuro
        document.getElementById('modalVistoria').addEventListener('click', function(e) {
            if (e.target === this) fecharModal();
        });