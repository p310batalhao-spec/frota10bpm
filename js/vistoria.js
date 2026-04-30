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
                return; // não limpa campos enquanto usuário está digitando
            }

            // Normaliza com zeros à esquerda (Excel às vezes corta o zero inicial)
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

                // Normaliza CPF: remove não-dígitos e completa com zeros à esquerda até 11 dígitos
                // CPFs no Firebase são sempre salvos com padStart(11,'0')
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
                motoristaAtual = { id, ...m };

                // Preenche campos readonly
                document.getElementById('v-posto').value             = m.posto      || '';
                document.getElementById('v-matricula').value         = m.matricula  || '';
                document.getElementById('v-motorista').value         = m.nomeCivil  || m.nomeGuerra || m.nome || m.Nome || '';
                document.getElementById('v-motorista-id').value      = id;
                document.getElementById('v-cpf-confirmado').value    = cpfRaw;

                // Pré-preenche CPF da assinatura com o mesmo valor digitado
                document.getElementById('ass-cpf').value = document.getElementById('v-cpf').value;

                statusEl.style.color = '#28a745';
                statusEl.textContent = `✅ ${m.posto || ''} ${m.nomeCivil || m.nomeGuerra || ''} — Mat: ${m.matricula || '—'}`;

                // Limpa assinatura anterior se havia outro motorista
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
            const cpfAss = document.getElementById('ass-cpf').value.replace(/\D/g,'').padStart(11,'0');
            // Senha = CPF (campo ass-senha reutilizado como confirmação do CPF)
            const senhaAss = document.getElementById('ass-senha').value.replace(/\D/g,'').padStart(11,'0');
            const msgEl  = document.getElementById('ass-msg');

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

            // Verifica se o CPF bate com o condutor já identificado
            const cpfCondutor = document.getElementById('v-cpf-confirmado').value.replace(/\D/g,'').padStart(11,'0');
            if (cpfCondutor && cpfAss !== cpfCondutor) {
                msgEl.style.color = '#dc3545';
                msgEl.textContent = '⚠️ CPF da assinatura diferente do CPF do condutor identificado.';
                return;
            }

            msgEl.style.color = '#555';
            msgEl.textContent = '🔎 Verificando...';

            try {
                // Autentica diretamente contra /motoristas — senha = CPF
                const normCPF = v => String(v || '').replace(/\D/g,'').padStart(11,'0');

                if (!motoristaAtual) {
                    msgEl.style.color = '#dc3545';
                    msgEl.textContent = '⚠️ Identifique o condutor pelo CPF antes de assinar.';
                    return;
                }

                // Confirma que o CPF informado bate com o motorista carregado (ambos com padStart)
                if (normCPF(motoristaAtual.cpf) !== normCPF(cpfAss)) {
                    msgEl.style.color = '#dc3545';
                    msgEl.textContent = '❌ CPF não corresponde ao condutor identificado.';
                    assinaturaConfirmada = false;
                    return;
                }

                // Autenticação OK — monta os dados da assinatura
                const agora = new Date();
                const horaStr = agora.toLocaleString('pt-BR');
                const m = motoristaAtual;

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

                // Exibe badge de confirmação
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
                msgEl.style.color = 'red'; msgEl.textContent = 'Erro ao verificar. Verifique a conexão.';
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

        async function carregarMapaDoDia() {
            const corpo = document.getElementById('tabela-mapa');
            corpo.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#aaa">Carregando...</td></tr>';

            try {
                // ── 1. Busca o mapa do dia e as vistorias em paralelo ──
                const [rMapa, rVist] = await Promise.all([
                    fetch(`${FB_URL}/mapa_diario.json`),
                    fetch(`${FB_URL}/vistorias.json`)
                ]);

                const dadosMapa     = await rMapa.json();
                const dadosVistorias = await rVist.json();

                corpo.innerHTML = '';

                if (!dadosMapa) {
                    corpo.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px">Nenhuma guarnição lançada para hoje.</td></tr>';
                    return;
                }

                const hoje = hojeISO();

                // ── 2. Monta o Set de prefixos+placas já vistoriados HOJE ──
                //    Chave: "PREFIXO|PLACA" — mesma lógica usada ao renderizar os botões.
                const jaVistoriados = new Set();

                if (dadosVistorias) {
                    Object.values(dadosVistorias).forEach(v => {
                        // dataHora está em ISO → compara apenas a parte da data
                        if (v.dataHora && v.dataHora.startsWith(hoje)) {
                            jaVistoriados.add(`${(v.prefixo||'').trim()}|${(v.placa||'').trim()}`);
                        }
                    });
                }

                // ── 3. Filtra guarnições do dia atual ──
                const listaDoDia = Object.keys(dadosMapa)
                    .map(id => ({ id, ...dadosMapa[id] }))
                    .filter(item => {
                        if (!item.dataHora) return false;
                        // Prioriza dataAgendamento se existir, senão usa dataHora
                        let dataItem;
                        if (item.dataAgendamento) {
                            dataItem = item.dataAgendamento; // já está em AAAA-MM-DD
                        } else {
                            // fallback: extrai data de dataHora
                            dataItem = item.dataHora.includes('T')
                                ? item.dataHora.substring(0, 10)
                                : item.dataHora.split('/').reverse().join('-');
                        }
                        return dataItem === hoje;
                    });

                if (listaDoDia.length === 0) {
                    corpo.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px">Nenhuma guarnição lançada para hoje.</td></tr>';
                    return;
                }

                // ── 4. Separa: pendentes vs. já vistoriadas ──
                const pendentes    = listaDoDia.filter(item =>
                    !jaVistoriados.has(`${(item.prefixo||'').trim()}|${(item.placa||'').trim()}`)
                );
                const concluidas   = listaDoDia.filter(item =>
                    jaVistoriados.has(`${(item.prefixo||'').trim()}|${(item.placa||'').trim()}`)
                );

                // ── 5. Exibe o contador no topo ──
                const totalMsg = document.querySelector('.instrucao p');
                totalMsg.innerHTML =
                    `Pendentes: <strong>${pendentes.length}</strong> &nbsp;|&nbsp; ` +
                    `Concluídas hoje: <strong style="color:#c8ff9a">${concluidas.length}</strong> &nbsp;|&nbsp; ` +
                    `Total do dia: <strong>${listaDoDia.length}</strong>`;

                // ── 6. Renderiza pendentes ──
                if (pendentes.length === 0) {
                    corpo.innerHTML = `
                        <tr>
                            <td colspan="4" style="text-align:center;padding:28px">
                                <span class="material-icons" style="font-size:2.5rem;color:#28a745;display:block;margin-bottom:8px">check_circle</span>
                                <strong style="color:#28a745">Todas as viaturas do dia já foram vistoriadas! ✅</strong>
                            </td>
                        </tr>`;
                    return;
                }

                pendentes.reverse().forEach(item => {
                    const prefixoSafe   = encodeURI(item.prefixo  || '');
                    const placaSafe     = encodeURI(item.placa    || '');
                    const guarnicaoSafe = encodeURI(item.guarnicao|| '');
                    corpo.innerHTML += `
                        <tr>
                            <td><strong>${item.guarnicao || '--'}</strong></td>
                            <td>${item.prefixo || '--'}</td>
                            <td>${item.placa   || '--'}</td>
                            <td>
                                <button class="btn-vistoria"
                                    onclick="abrirVistoria(decodeURI('${guarnicaoSafe}'), decodeURI('${prefixoSafe}'), decodeURI('${placaSafe}'))">
                                    <span class="material-icons">assignment_turned_in</span> VISTORIAR
                                </button>
                            </td>
                        </tr>`;
                });

            } catch (e) {
                console.error(e);
                document.getElementById('tabela-mapa').innerHTML =
                    '<tr><td colspan="4" style="text-align:center;color:red;padding:20px">Erro ao carregar dados. Verifique a conexão.</td></tr>';
            }
        }

        // ── Abre o modal com os dados da guarnição ──
        function abrirVistoria(guarnicao, prefixo, placa) {
            document.getElementById('v-guarnicao').value = guarnicao;
            document.getElementById('v-prefixo').value  = prefixo;
            document.getElementById('v-placa').value    = placa;
            document.getElementById('modalVistoria').style.display = 'block';
        }

        function fecharModal() {
            document.getElementById('modalVistoria').style.display = 'none';
            document.getElementById('formVistoria').reset();
            // Limpa estado da identificação e assinatura
            motoristaAtual = null;
            assinaturaConfirmada = false;
            assinaturaDados = null;
            document.getElementById('v-cpf-status').textContent = '';
            document.getElementById('assinatura-confirmada').style.display = 'none';
            document.getElementById('ass-msg').textContent = '';
        }

        // ── Submit: salva e remove a linha da tabela ──
        document.getElementById('formVistoria').onsubmit = async (e) => {
            e.preventDefault();

            // Valida identificação do condutor
            if (!motoristaAtual) {
                mostrarMsg('⚠️ Identifique o condutor pelo CPF antes de continuar.', 'erro');
                document.getElementById('v-cpf').focus();
                return;
            }

            // Valida assinatura eletrônica
            if (!assinaturaConfirmada || !assinaturaDados) {
                mostrarMsg('⚠️ A assinatura eletrônica é obrigatória! Confirme com CPF e senha.', 'erro');
                document.getElementById('ass-cpf').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'ENVIANDO...';

            const dadosVistoria = {
                prefixo:      document.getElementById('v-prefixo').value,
                placa:        document.getElementById('v-placa').value,
                guarnicao:    document.getElementById('v-guarnicao').value,
                // Dados do condutor (vindos do cadastro de motoristas)
                posto:        assinaturaDados.posto     || document.getElementById('v-posto').value,
                matricula:    assinaturaDados.matricula || document.getElementById('v-matricula').value,
                motorista:    assinaturaDados.nomeGuerra,
                nomeCivil:    assinaturaDados.nomeCivil,
                cpf:          assinaturaDados.cpf,
                // Checklist
                combustivel:  document.getElementById('v-combustivel').value,
                km:           document.getElementById('v-km').value,
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
                // Assinatura eletrônica — armazena todos os dados identificadores
                assinatura: {
                    tipo:              'eletronica_cpf',
                    nomeCivil:         assinaturaDados.nomeCivil,
                    nomeGuerra:        assinaturaDados.nomeGuerra,
                    posto:             assinaturaDados.posto,
                    matricula:         assinaturaDados.matricula,
                    cpf:               assinaturaDados.cpf,
                    horaConfirmacao:   assinaturaDados.horaConfirmacao,
                },
                dataHora: new Date().toISOString()
            };

            try {
                await fetch(`${FB_URL}/vistorias.json`, {
                    method: 'POST',
                    body: JSON.stringify(dadosVistoria),
                    headers: { 'Content-Type': 'application/json' }
                });

                mostrarMsg('Vistoria registrada com sucesso! ✅', 'ok');
                fecharModal();

                // ── Recarrega a lista — a viatura recém-vistoriada não vai mais aparecer ──
                carregarMapaDoDia();

            } catch (error) {
                console.error(error);
                mostrarMsg('Erro ao salvar vistoria. Tente novamente.', 'erro');
                btn.disabled = false;
                btn.textContent = 'FINALIZAR VISTORIA E LIBERAR';
            }
        };

        function mostrarMsg(texto, tipo) {
            const el = document.getElementById('msg-feedback');
            el.textContent = texto;
            el.style.display = 'block';
            el.style.backgroundColor = tipo === 'ok' ? 'var(--cor-success)' : 'var(--cor-danger)';
            setTimeout(() => el.style.display = 'none', 3500);
        }

        // Fecha modal APENAS ao clicar no fundo escuro do overlay
        document.getElementById('modalVistoria').addEventListener('click', function(e) {
            if (e.target === this) fecharModal();
        });
