/**
 * coletor-geo-actions.js — GitHub Actions
 * Coleta GEO e envia para Google Apps Script → Google Sheets
 * 
 * Secrets necessários:
 *   GAS_URL = URL do Apps Script implantado
 */

const https = require('https');

const GEO_URL   = 'https://analisacad.seguranca.al.gov.br/app/cad/cad_blank_carregar_pontos/cad_blank_carregar_pontos.php';
const GAS_URL   = process.env.GAS_URL; // Secret do GitHub
const UNIDADE   = '10º BPM';

// ── HTTP helpers ─────────────────────────────────────────────────
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://analisacad.seguranca.al.gov.br/',
            },
            rejectUnauthorized: false,
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout GEO')); });
    });
}

function httpPost(urlStr, dados) {
    return new Promise((resolve, reject) => {
        const corpo = JSON.stringify(dados);
        const url   = new URL(urlStr);
        const opts  = {
            hostname: url.hostname,
            path:     url.pathname + url.search,
            method:   'POST',
            headers: {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(corpo),
            },
        };
        const req = https.request(opts, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
                catch { resolve({ ok: true }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout GAS')); });
        req.write(corpo);
        req.end();
    });
}

// ── Parser GEO ───────────────────────────────────────────────────
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
            idRadio:     c[3].trim(),
            dataHora,    timestamp,
            guarnicao:   c[5].trim(),
            unidade:     c[6].trim(),
            modalidade:  c[7].trim(),
            militares:   c[8].trim(),
            ocorrencia:  c[9].trim() !== '0' ? c[9].trim() : null,
            tipoVeiculo: c[11].trim(),
            status:      c[13] ? c[13].trim() : '',
        });
    });
    return lista;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
    if (!GAS_URL) {
        console.error('[GEO] GAS_URL não configurado. Adicione o secret no GitHub.');
        process.exit(1);
    }

    console.log(`[GEO] ${new Date().toLocaleString('pt-BR')} — coletando...`);

    // 1. Busca GEO
    const url = `${GEO_URL}?numQuery=1&idUnidade=0&idModalidade=999999&numRadio=0`;
    const buf = await httpGet(url);
    const todas = parsear(buf);
    console.log(`[GEO] ${todas.length} guarnicoes recebidas`);

    // 2. Filtra 10º BPM
    const norm = s => String(s || '').replace(/[^A-Z0-9 /]/gi, '').trim().toUpperCase();
    const alvo = norm(UNIDADE);
    const daUnidade = todas.filter(g => norm(g.unidade) === alvo);
    console.log(`[GEO] 10 BPM: ${daUnidade.length} guarnicoes`);

    if (daUnidade.length === 0) {
        console.log('[GEO] Nenhuma guarnicao. Encerrando.');
        process.exit(0);
    }

    // 3. Formata payload para o GAS
    const guarnicoes = daUnidade.map(g => ({
        idRadio:     g.idRadio,
        nome:        g.guarnicao,
        unidade:     g.unidade,
        modalidade:  g.modalidade,
        militares:   g.militares,
        tipoVeiculo: g.tipoVeiculo,
        status:      g.status,
        ocorrencia:  g.ocorrencia,
        lat:         g.lat,
        lng:         g.lng,
        dataHoraGEO: g.dataHora,
        timestamp:   g.timestamp,
    }));

    // 4. Envia para o Google Apps Script
    console.log(`[GEO] Enviando para GAS...`);
    const resp = await httpPost(GAS_URL, { guarnicoes });
    console.log(`[GEO] GAS respondeu:`, resp);

    if (resp.ok) {
        console.log(`[GEO] Salvas: ${resp.salvas} guarnicoes no Sheets. Concluido.`);
    } else {
        console.error('[GEO] Erro no GAS:', resp.erro);
        process.exit(1);
    }

    process.exit(0);
}

main().catch(e => {
    console.error('[GEO] Erro fatal:', e.message);
    process.exit(1);
});
