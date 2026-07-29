/**
 * coletor-geo-actions.js
 * Versão para GitHub Actions — faz UMA coleta e encerra.
 * O workflow.yml agenda a execução a cada 2 minutos.
 * 
 * Variável de ambiente necessária (GitHub Secret):
 *   FIREBASE_URL = https://frota10bpm-dc14a-default-rtdb.firebaseio.com
 */

const https = require('https');

const FB_URL  = process.env.FIREBASE_URL
             || 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';

const GEO_URL = 'https://analisacad.seguranca.al.gov.br/app/cad/cad_blank_carregar_pontos/cad_blank_carregar_pontos.php';

const UNIDADE_FROTA = '10º BPM';

// ── Helpers HTTP ─────────────────────────────────────────────────
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const opts = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer':    'https://analisacad.seguranca.al.gov.br/',
                'Accept':     'text/plain,*/*',
            },
            rejectUnauthorized: false,
        };
        const req = https.get(url, opts, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function fbPut(path, dados) {
    return new Promise((resolve, reject) => {
        const corpo = JSON.stringify(dados);
        const url   = new URL(`${FB_URL}${path}.json`);
        const opts  = {
            method:  'PUT',
            headers: {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(corpo),
            },
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

// ── Parser ───────────────────────────────────────────────────────
function parsear(buf) {
    let texto = buf.toString('utf8');
    if (!texto.includes('#(')) texto = buf.toString('latin1');

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
        let timestamp  = null;
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

// ── Coleta principal ─────────────────────────────────────────────
async function main() {
    console.log(`[GEO] ${new Date().toLocaleString('pt-BR')} — iniciando coleta...`);

    // 1. Busca dados do GEO
    const url = `${GEO_URL}?numQuery=1&idUnidade=0&idModalidade=999999&numRadio=0`;
    const buf = await httpGet(url);
    const todas = parsear(buf);
    console.log(`[GEO] ${todas.length} guarnicoes recebidas`);

    // 2. Filtra pela unidade (normaliza encoding)
    const norm = s => String(s || '').replace(/[^A-Z0-9 /]/gi, '').trim().toUpperCase();
    const alvo = norm(UNIDADE_FROTA);
    const daUnidade = todas.filter(g => norm(g.unidade) === alvo);
    console.log(`[GEO] Da unidade "${UNIDADE_FROTA}": ${daUnidade.length} guarnicoes`);

    if (daUnidade.length === 0) {
        console.log('[GEO] Nenhuma guarnicao para salvar. Encerrando.');
        process.exit(0);
    }

    // 3. Salva no Firebase
    const agora = new Date().toISOString();
    let salvas = 0;

    for (const g of daUnidade) {
        const chave = g.idRadio || g.guarnicao.replace(/\s+/g, '_');

        const dados = {
            lat: g.lat, lng: g.lng,
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

        // Posição atual
        await fbPut(`/rastreamento/${chave}`, dados);

        // Histórico
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

    // 4. Atualiza status do coletor
    await fbPut('/rastreamento_meta/status', {
        online:       true,
        ultimaColeta: agora,
        totalGEO:     todas.length,
        totalUnidade: daUnidade.length,
        origem:       'github-actions',
    });

    console.log(`[GEO] Salvas: ${salvas} | Concluido.`);
    process.exit(0);
}

main().catch(e => {
    console.error('[GEO] Erro fatal:', e.message);
    process.exit(1);
});