const http = require('http');
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK - Bot Guard ARVX 588 Running');
}).listen(PORT, '0.0.0.0', () => {
    console.log('[SERVER] Web aktif di 0.0.0.0:' + PORT);
});

process.on('uncaughtException', (err) => console.error('[ERROR]', err));
process.on('unhandledRejection', (err) => console.error('[REJECTION]', err));

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

const CONFIG = {
    botName: 'TOTAL-GUARD ARVX 588',
    botPhoneNumber: '79778547925',
    usePairingCode: true,
    groupLinkWhitelist: 'https://chat.whatsapp.com/IcECPgfBoCT0HT78QJxoyr?s=cl&p=a&mlu=4&ilr=4',
    adminNumber: '628157159957@s.whatsapp.net',
    welcomeOn: true,
    goodbyeOn: true,
    welcomeMessage: '『  𝐈𝐍𝐓𝐑𝐎 𝐂𝐀𝐑𝐃 — 𝐀𝐑𝐕𝐗 588  』\n\nWelcome to ARVX 588.\n\n━━━━━━━━━━━━━━\nNama :\nUmur :\nGender :\nAsal :\nTag admin :\n━━━━━━━━━━━━━━\n📸 Kirim poto 1× liat ( bebas)\n\nHalo @user 👋 Selamat bergabung! Silakan isi kartu intro di atas ya.\nTautan Resmi Grup: https://whatsapp.com',
    goodbyeMessage: 'Selamat tinggal *@user* 🕊️, terima kasih telah mampir di ARVX 588.',
    antiGroupStatus: true,
    antiLink: true,
    antiMediaBiasa: true,
    maxTextLength: 1000,
    maxStickerLimit: 3,
    stickerCooldown: 10000,
    maxChatLimit: 4,
    floodCooldown: 3000
};

function loadBlacklist() {
    try {
        if (!fs.existsSync('blacklist.json')) fs.writeFileSync('blacklist.json', '[]');
        return new Set(JSON.parse(fs.readFileSync('blacklist.json', 'utf-8')));
    } catch (e) { return new Set(); }
}

function saveBlacklist(set) {
    try { fs.writeFileSync('blacklist.json', JSON.stringify(Array.from(set), null, 2)); } catch (e) {}
}

const blacklist = loadBlacklist();
const stickerTracker = new Map();
const floodTracker = new Map();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_guard_bot');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !CONFIG.usePairingCode,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    if (CONFIG.usePairingCode && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const cleanNumber = CONFIG.botPhoneNumber.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(cleanNumber);
                console.log('\n========================================');
                console.log('🔑 KODE TAUTAN WA ANDA: ' + code);
                console.log('========================================\n');
            } catch (err) {
                console.log('Gagal meminta Pairing Code:', err.message);
            }
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        for (let num of participants) {
            const userTag = '@' + num.split('@')[0];
            if (action === 'add') {
                if (blacklist.has(num)) {
                    await sock.sendMessage(id, { text: '🚨 Nomor ' + userTag + ' terdeteksi dalam daftar hitam ARVX 588! Mengeluarkan otomatis...', mentions: [num] });
                    await sock.groupParticipantsUpdate(id, [num], 'remove');
                    continue;
                }
                if (CONFIG.welcomeOn) {
                    let text = CONFIG.welcomeMessage.replace('@user', userTag);
                    await sock.sendMessage(id, { text: text, mentions: [num] });
                }
            } else if (action === 'remove' && CONFIG.goodbyeOn) {
                let text = CONFIG.goodbyeMessage.replace('@user', userTag);
                await sock.sendMessage(id, { text: text, mentions: [num] });
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg || !msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = msg.key.participant || msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';

        if (!isGroup) return;

        const type = Object.keys(msg.message)[0];
        const now = Date.now();

        let isGroupAdmin = false;
        try {
            const groupMeta = await sock.groupMetadata(from);
            const participant = groupMeta.participants.find(p => p.id === sender || p.jid === sender);
            isGroupAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
        } catch (e) {}

        // 👑 PERINTAH KHUSUS ADMIN UTAMA ATAU ADMIN GRUP
        if (sender === CONFIG.adminNumber || isGroupAdmin || msg.key.fromMe) {
            if (text === '.closegrup') {
                await sock.groupSettingUpdate(from, 'announcement');
                await sock.sendMessage(from, { text: '🔒 *Grup ARVX 588 Ditutup Sementara oleh Admin!*' });
                return;
            }
            if (text === '.opengrup') {
                await sock.groupSettingUpdate(from, 'not_announcement');
                await sock.sendMessage(from, { text: '🔓 *Grup ARVX 588 Dibuka Kembali!*' });
                return;
            }
            if (text === '.rules') {
                await sock.sendMessage(from, { text: CONFIG.welcomeMessage.replace('@user', 'Semua Anggota') });
                return;
            }
            if (text.startsWith('.hidetag ')) {
                const pengumuman = text.slice(9);
                const groupMeta = await sock.groupMetadata(from);
                await sock.sendMessage(from, { text: pengumuman, mentions: groupMeta.participants.map(p => p.id) });
                return;
            }
            if (text.startsWith('.kick')) {
                const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
                const target = mentioned && mentioned[0];
                if (target) {
                    await sock.groupParticipantsUpdate(from, [target], 'remove');
                    await sock.sendMessage(from, { text: '✅ *@' + target.split('@')[0] + '* telah dikeluarkan oleh Admin.', mentions: [target] });
                }
                return;
            }
            if (text === '.cekblacklist') {
                const list = Array.from(blacklist).map(num => '@' + num.split('@')[0]);
                await sock.sendMessage(from, { text: '📋 *Daftar Hitam ARVX 588:*\n\n' + (list.length > 0 ? list.join('\n') : 'Kosong'), mentions: Array.from(blacklist) });
                return;
            }
            if (text.startsWith('.unblacklist ')) {
                const nomorHapus = text.replace('.unblacklist ', '').replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                if (blacklist.has(nomorHapus)) {
                    blacklist.delete(nomorHapus);
                    saveBlacklist(blacklist);
                    await sock.sendMessage(from, { text: '✅ Nomor berhasil dihapus dari daftar hitam.' });
                } else {
                    await sock.sendMessage(from, { text: '⚠️ Nomor tidak ditemukan di daftar hitam.' });
                }
                return;
            }
        }

        if (CONFIG.antiGroupStatus && (type === 'groupStatusMessage' || msg.message.statusMessage)) {
            await sock.sendMessage(from, { delete: msg.key });
            return;
        }

        let userChats = floodTracker.get(sender) || [];
        userChats = userChats.filter(timestamp => now - timestamp < CONFIG.floodCooldown);
        userChats.push(now);
        floodTracker.set(sender, userChats);

        if (userChats.length > CONFIG.maxChatLimit && !isGroupAdmin) {
            await sock.sendMessage(from, { delete: msg.key });
            blacklist.add(sender);
            saveBlacklist(blacklist);
            await sock.sendMessage(from, { text: '🚨 *@' + sender.split('@')[0] + '* otomatis di-KICK & BLACKLIST karena spam/flood chat!', mentions: [sender] });
            await sock.groupParticipantsUpdate(from, [sender], 'remove');
            return;
        }

        if (text.length > CONFIG.maxTextLength && !isGroupAdmin) {
            await sock.sendMessage(from, { delete: msg.key });
            return;
        }

        const mentions = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentions.length > 5 && !isGroupAdmin) {
            await sock.sendMessage(from, { delete: msg.key });
            return;
        }

        if (type === 'stickerMessage' && !isGroupAdmin) {
            let userStickers = stickerTracker.get(sender) || [];
            userStickers = userStickers.filter(timestamp => now - timestamp < CONFIG.stickerCooldown);
            userStickers.push(now);
            stickerTracker.set(sender, userStickers);

            if (userStickers.length > CONFIG.maxStickerLimit) {
                await sock.sendMessage(from, { delete: msg.key });
                return;
            }
        }

        if (type === 'groupInviteMessage' && !isGroupAdmin) {
            await sock.sendMessage(from, { delete: msg.key });
            blacklist.add(sender);
            saveBlacklist(blacklist);
            await sock.sendMessage(from, { text: '🚨 *@' + sender.split('@')[0] + '* di-KICK karena menyebarkan undangan grup lain!', mentions: [sender] });
            await sock.groupParticipantsUpdate(from, [sender], 'remove');
            return;
        }

        if (CONFIG.antiLink && !isGroupAdmin && (text.includes('http://') || text.includes('https://') || text.includes('wa.me/'))) {
            if (!text.includes(CONFIG.groupLinkWhitelist)) {
                await sock.sendMessage(from, { delete: msg.key });
                blacklist.add(sender);
                saveBlacklist(blacklist);
                await sock.sendMessage(from, { text: '🚨 *@' + sender.split('@')[0] + '* otomatis di-KICK & BLACKLIST karena menyebarkan tautan luar!', mentions: [sender] });
                await sock.groupParticipantsUpdate(from, [sender], 'remove');
                return;
            }
        }

        if (CONFIG.antiMediaBiasa && !isGroupAdmin) {
            const mediaDilarang = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'];
            if (mediaDilarang.includes(type)) {
                const isViewOnce = msg.message.imageMessage?.viewOnce || msg.message.videoMessage?.viewOnce;
                if (!isViewOnce) {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, { text: '⚠️ *@' + sender.split('@')[0] + '*, foto/video/file biasa dilarang. Silakan kirim gambar menggunakan fitur *1x Lihat (View Once)*!', mentions: [sender] });
                    return;
                }
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ [' + CONFIG.botName + '] Berhasil Terhubung & Menjaga Grup ARVX 588!');
        }
    });
}

startBot();
