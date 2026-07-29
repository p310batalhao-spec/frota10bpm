/**
 * coletor-geo.js — Roda no seu computador (Node.js)
 * Coleta posições do GEO a cada 100s e salva no Firebase
 * 
 * Instalação:
 *   npm install node-fetch iconv-lite
 * 
 * Uso:
 *   node coletor-geo.js
 */

const https  = require('https');
const http   = require('http');

const FB_URL  = 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';
// URL do endpoint GEO — obtida via DevTools Network
// Se der 404, verificar a URL exata em: DevTools → Network → cad_blank_carregar_pontos → Headers → Request URL
const GEO_URL = 'https://analisacad.seguranca.al.gov.br/app/cad/cad_blank_carregar_pontos/cad_blank_carregar_pontos.php';
const INTERVALO_MS = 100_000; // 100 segundos

// ── Fetch nativo do Node (sem bibliotecas externas) ──────────────
function fetchGEO(numQuery = 1) {
    return new Promise((resolve, reject) => {
        const url = `${GEO_URL}?numQuery=${numQuery}&idUnidade=0&idModalidade=999999&numRadio=0`;
        const opts = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer':    'https://analisacad.seguranca.al.gov.br/',
                'Accept':     'text/plain,*/*',
            },
            rejectUnauthorized: false, // GEO pode ter SSL com problema
        };

        const req = https.get(url, opts, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                // Tenta UTF-8 primeiro, depois latin1
                let texto = buf.toString('utf8');
                if (!texto.includes('#(')) {
                    texto = buf.toString('latin1');
                }
                if (!texto.includes('#(')) {
                    texto = buf.toString('binary');
                }
                resolve(texto);
            });
        });
        req.on('error', reject);
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

// ── Salvar no Firebase ───────────────────────────────────────────
function fbPut(path, dados) {
    return new Promise((resolve, reject) => {
        const corpo = JSON.stringify(dados);
        const url   = new URL(`${FB_URL}${path}.json`);
        const opts  = {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpo) },
        };
        const req = https.request(url, opts, res => {
            res.resume();
            resolve(res.statusCode);
        });
        req.on('error', reject);
        req.write(corpo);
        req.end();
    });
}

function fbGet(path) {
    return new Promise((resolve, reject) => {
        https.get(`${FB_URL}${path}.json`, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
                catch(e) { resolve(null); }
            });
        }).on('error', reject);
    });
}

// ── Parser do formato GEO ────────────────────────────────────────
function parsear(texto) {
    const lista = [];
    const inicio = texto.indexOf('#(');
    if (inicio === -1) return lista;

    texto.substring(inicio).split('#').filter(r => r.startsWith('(')).forEach(reg => {
        const c = reg.split('(');
        if (c.length < 13) return;
        const lat = parseFloat(c[1]);
        const lng = parseFloat(c[2]);
        if (!lat || !lng) return;

        const dataHora = c[4].trim();
        let timestamp = null;
        const m = dataHora.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
        if (m) timestamp = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`;

        lista.push({
            lat, lng,
            idRadio:    c[3].trim(),
            dataHora,   timestamp,
            guarnicao:  c[5].trim(),
            unidade:    c[6].trim(),
            modalidade: c[7].trim(),
            militares:  c[8].trim(),
            ocorrencia: c[9].trim() !== '0' ? c[9].trim() : null,
            tipoVeiculo: c[11].trim(),
            status:     c[13] ? c[13].trim() : '',
        });
    });
    return lista;
}

// Unidade do sistema de frota — filtra os dados do GEO por esta unidade
// Deve bater com o campo "unidade" que vem no GEO (ex: "10º BPM", "10 BPM")
const UNIDADE_FROTA = '10º BPM'; // ajuste se o GEO usar grafia diferente

// ── Ciclo principal ──────────────────────────────────────────────
async function sincronizar() {
    try {
        console.log(`\n[GEO] ${new Date().toLocaleString('pt-BR')} — coletando...`);
        const texto = await fetchGEO(1);
        const todas = parsear(texto);
        console.log(`[GEO] ${todas.length} guarnicoes recebidas do GEO`);

        // Mostra todas as unidades únicas presentes na resposta do GEO
        const unidsUnicas = [...new Set(todas.map(g => g.unidade))].sort();
        console.log('[GEO] Unidades presentes:', unidsUnicas.join(' | '));

        // Filtra apenas a unidade do sistema de frota
        // Remove qualquer caractere não alfanumérico/espaço antes de comparar
        // (cobre: "10º BPM", "10° BPM", "10? BPM", "10 BPM")
        const normUnid = s => String(s || '').replace(/[^A-Z0-9 /]/gi, '').trim().toUpperCase();
        const unidAlvo  = normUnid(UNIDADE_FROTA);
        const daUnidade = todas.filter(g => normUnid(g.unidade) === unidAlvo);
        console.log(`[GEO] Da unidade "${UNIDADE_FROTA}": ${daUnidade.length} guarnicoes`);

        let salvas = 0;
        const agora = new Date().toISOString();

        for (const g of daUnidade) {
            const chave = g.idRadio || g.guarnicao.replace(/\s+/g, '_');

            const dados = {
                lat:         g.lat,
                lng:         g.lng,
                idRadio:     g.idRadio,
                nome:        g.guarnicao,
                unidade:     g.unidade,
                modalidade:  g.modalidade,
                militares:   g.militares,
                tipoVeiculo: g.tipoVeiculo,
                status:      g.status,
                ocorrencia:  g.ocorrencia,
                dataHoraGEO: g.dataHora,
                coletadoEm:  agora,
            };

            // Posicao atual (sobrescreve)
            await fbPut(`/rastreamento/${chave}`, dados);

            // Historico acumulado
            if (g.timestamp) {
                const chHist = g.timestamp.replace(/[:.]/g, '-').slice(0, 19);
                await fbPut(`/rastreamento_historico/${chave}/${chHist}`, {
                    lat: g.lat, lng: g.lng,
                    nome: g.guarnicao, status: g.status,
                    dataHora: g.dataHora, militares: g.militares,
                });
            }
            salvas++;
        }

        console.log(`[GEO] Salvas: ${salvas} guarnicoes do 10 BPM no Firebase`);

        await fbPut('/rastreamento_meta/status', {
            online:       true,
            ultimaColeta: agora,
            totalGEO:     todas.length,
            totalUnidade: daUnidade.length,
            unidade:      UNIDADE_FROTA,
        });

    } catch(e) {
        console.error('[GEO] Erro:', e.message);
    }
}

// ── Inicia ───────────────────────────────────────────────────────
console.log('╔════════════════════════════════════════╗');
console.log('║  Coletor GEO — 10º BPM                ║');
console.log('║  Firebase: frota10bpm-dc14a            ║');
console.log(`║  Intervalo: ${INTERVALO_MS/1000}s                    ║`);
console.log('╚════════════════════════════════════════╝');

// Inicia coleta imediata e agenda as próximas
sincronizar();
setInterval(sincronizar, INTERVALO_MS);