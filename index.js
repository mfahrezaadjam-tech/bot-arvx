const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

// ==========================================
// ⚙️ KONFIGURASI TOTAL-SECURITY PREMIUM
// ==========================================
const CONFIG = {
    botName: 'TOTAL-GUARD ARVX 588',
    groupLinkWhitelist: 'https://chat.whatsapp.com/IcECPgfBoCT0HT78QJxoyr?s=cl&p=a&mlu=4&ilr=4',
    superAdmins: [
        '628157159957@s.whatsapp.net',  // Nomor Utama Kamu
        '6285731483913@s.whatsapp.net', // Admin Baru 1
        '6288271317372@s.whatsapp.net'  // Admin Baru 2
    ],
    welcomeMessage: '『  𝐈𝐍𝐓𝐑𝐎 𝐂𝐀𝐑Ｄ — ＡＲ𝐕𝐗 588  』\n\nWelcome to ARVX 588.\n\nHalo @user 👋 Selamat bergabung! Silakan isi kartu intro di atas ya.\nTautan Resmi Grup: https://chat.whatsapp.com/IcECPgfBoCT0HT78QJxoyr?s=cl&p=a&mlu=4&ilr=4',
    goodbyeMessage: 'Selamat tinggal *@user* 🕊️, terima kasih telah mampir di ARVX 588.',
    welcomeOn: true,       
    antiLink: true,
    antiMediaBiasa: true,
    maxChatLimit: 5,        
    floodCooldown: 4000,    
    maxStickerLimit: 3,     
    stickerCooldown: 10000, 
    maxTextLength: 1000,    
    maxWarnLimit: 3, 
    toxicWords: ['anjing', 'anjg', 'bangsat', 'bgsd', 'kontol', 'kntl', 'memek', 'mmk', 'goblok', 'gblg', 'tolol'],
    shortenerLinks: ['bit.ly', 'tinyurl.com', 'dub.sh', 'linktr.ee', 'cut.ly', 't.co']
};

if (!fs.existsSync('blacklist.json')) fs.writeFileSync('blacklist.json', '[]');
if (!fs.existsSync('warnlist.json')) fs.writeFileSync('warnlist.json', '{}');

const blacklist = new Set(JSON.parse(fs.readFileSync('blacklist.json', 'utf-8')));
const warnDatabase = JSON.parse(fs.readFileSync('warnlist.json', 'utf-8'));
const floodTracker = new Map();
const stickerTracker = new Map();

function saveBlacklist() { fs.writeFileSync('blacklist.json', JSON.stringify(Array.from(blacklist), null, 2)); }
function saveWarnlist() { fs.writeFileSync('warnlist.json', JSON.stringify(warnDatabase, null, 2)); }

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('zeabur_session');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, 
        browser: ['Windows', 'Chrome', '125.0.0.0'],
        syncFullHistory: false,    
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    let qrGenerated = false;
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && !qrGenerated) {
            console.log('\n============================================================');
            qrcode.generate(qr, { small: true });
            qrGenerated = true;
        }
        if (connection === 'close') {
            qrGenerated = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => startBot(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ BOOM! KONEKSI TERKUNCI PERMANEN! BOT GUARD ARVX 588 ONLINE 24 JAM!');
        }
    });

    sock.ev.on('call', async (callUpdate) => {
        for (let call of callUpdate) {
            if (call.status === 'offer') await sock.rejectCall(call.id, call.from);
        }
    });

    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        for (let num of participants) {
            const userTag = '@' + num.split('@');
            if (action === 'add') {
                if (blacklist.has(num)) {
                    await sock.sendMessage(id, { text: '🚨 Nomor ' + userTag + ' masuk daftar hitam ARVX 588! Mengeluarkan...', mentions: [num] });
                    await sock.groupParticipantsUpdate(id, [num], 'remove');
                    continue;
                }
                if (CONFIG.welcomeOn) {
                    await sock.sendMessage(id, { text: CONFIG.welcomeMessage.replace('@user', userTag), mentions: [num] });
                }
            } else if (action === 'remove' && CONFIG.welcomeOn) {
                await sock.sendMessage(id, { text: CONFIG.goodbyeMessage.replace('@user', userTag), mentions: [num] });
            }
        }
    });

       // ==========================================
    // 🤖 PEMPROSES PESAN UTAMA (ANTI-LOGIKAL ERROR)
    // ==========================================
    sock.ev.on('messages.upsert', async (m) => {
        if (!m.messages || m.messages.length === 0) return;
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        
        // JALUR PALING AKURAT: Ambil ID murni lalu bersihkan karakter LID privasi jika ada
        const rawSender = msg.key.participant || msg.key.remoteJid || '';
        const sender = (msg.key.senderPn || msg.key.participantAlt || rawSender).split(':')[0].split('@')[0];
        
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '').trim();

        if (!isGroup) return;

        const type = Object.keys(msg.message);
        const now = Date.now();
        const userTag = '@' + sender + '@s.whatsapp.net';

        // Bersihkan daftar superAdmins agar pencocokan string 100% akurat
        const cleanSuperAdmins = CONFIG.superAdmins.map(v => v.split('@')[0]);
        const isSuperAdmin = cleanSuperAdmins.includes(sender);

        let isGroupAdmin = false;
        try {
            const groupMeta = await sock.groupMetadata(from);
            const participant = groupMeta.participants.find(p => p.id.split('@')[0] === rawSender.split('@')[0] || p.id.split('@')[0] === sender);
            isGroupAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
        } catch (e) {}

        // HAK AKSES TOTAL KENDALI ADMIN
        const hasFullAccess = (isSuperAdmin || isGroupAdmin);


        if (hasFullAccess) {
            if (text === '.closegrup') {
                await sock.groupSettingUpdate(from, 'announcement');
                await sock.sendMessage(from, { text: '🔒 *Grup ARVX 588 Ditutup Sementara oleh Admin!* Hanya admin yang dapat mengirim pesan.' });
                return;
            }
            if (text === '.opengrup') {
                await sock.groupSettingUpdate(from, 'not_announcement');
                await sock.sendMessage(from, { text: '🔓 *Grup ARVX 588 Dibuka Kembali!* Anggota silakan mengobrol tertib.' });
                return;
            }
            if (text === '.welcome on') {
                CONFIG.welcomeOn = true;
                await sock.sendMessage(from, { text: '✅ *Pesan sambutan Welcome & Goodbye berhasil DIAKTIFKAN!*' });
                return;
            }
            if (text === '.welcome off') {
                CONFIG.welcomeOn = false;
                await sock.sendMessage(from, { text: '❌ *Pesan sambutan Welcome & Goodbye berhasil DIMATIKAN!*' });
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
                const target = mentioned || msg.message.extendedTextMessage?.contextInfo?.participant;
                if (target) {
                    await sock.groupParticipantsUpdate(from, [target], 'remove');
                    await sock.sendMessage(from, { text: '✅ *@' + target.split('@') + '* telah dikeluarkan oleh Admin.', mentions: [target] });
                }
                return;
            }
            if (text === '.cekblacklist') {
                const list = Array.from(blacklist).map(num => '@' + num.split('@'));
                await sock.sendMessage(from, { text: '📋 *Daftar Hitam ARVX 588:*\n\n' + (list.length > 0 ? list.join('\n') : 'Kosong'), mentions: Array.from(blacklist) });
                return;
            }
            if (text.startsWith('.unblacklist ')) {
                const nomorHapus = text.replace('.unblacklist ', '').replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                if (blacklist.has(nomorHapus)) {
                    blacklist.delete(nomorHapus); saveBlacklist();
                    await sock.sendMessage(from, { text: '✅ Nomor berhasil dihapus dari daftar hitam.' });
                }
                return;
            }
        }

        if (!hasFullAccess) {
            if (msg.message.extendedTextMessage?.contextInfo?.isForwarded || msg.message.imageMessage?.contextInfo?.isForwarded) {
                await sock.sendMessage(from, { delete: msg.key });
                await sock.sendMessage(from, { text: `⚠️ ${userTag} *Dilarang meneruskan pesan (Forward) luar ke grup ini!*`, mentions: [sender] });
                return;
            }

            const containsShortener = CONFIG.shortenerLinks.some(link => text.toLowerCase().includes(link));
            if (containsShortener) {
                await sock.sendMessage(from, { delete: msg.key });
                blacklist.add(sender); saveBlacklist();
                await sock.sendMessage(from, { text: `🚨 ${userTag} *Otomatis di-KICK & BLACKLIST karena menyebarkan link URL Shortener!*`, mentions: [sender] });
                await sock.groupParticipantsUpdate(from, [sender], 'remove');
                return;
            }

            if (text.length > CONFIG.maxTextLength) {
                await sock.sendMessage(from, { delete: msg.key });
blacklist.add(sender); saveBlacklist();
await sock.sendMessage(from, { text: 🚨 ${userTag} *Banned & Kick otomatis karena terdeteksi mengirim teks Virtex berbahaya!*, mentions: [sender] });
await sock.groupParticipantsUpdate(from, [sender], 'remove');
return;
}
if (type === 'stickerMessage') {
let userStickers = stickerTracker.get(sender) || [];
userStickers = userStickers.filter(timestamp => now - timestamp < CONFIG.stickerCooldown);
userStickers.push(now); stickerTracker.set(sender, userStickers);
if (userStickers.length > CONFIG.maxStickerLimit) { await sock.sendMessage(from, { delete: msg.key }); return; }
}
let userChats = floodTracker.get(sender) || [];
userChats = userChats.filter(timestamp => now - timestamp < CONFIG.floodCooldown);
userChats.push(now); floodTracker.set(sender, userChats);
if (userChats.length > CONFIG.maxChatLimit) {
await sock.sendMessage(from, { delete: msg.key });
blacklist.add(sender); saveBlacklist();
await sock.sendMessage(from, { text: 🚨 ${userTag} *Otomatis dikeluarkan akibat spamming chat melanggar batas jeda waktu!*, mentions: [sender] });
await sock.groupParticipantsUpdate(from, [sender], 'remove');
return;
}
const cleanText = text.toLowerCase();
const containsToxic = CONFIG.toxicWords.some(word => cleanText.includes(word));
if (containsToxic) {
await sock.sendMessage(from, { delete: msg.key });
warnDatabase[sender] = (warnDatabase[sender] || 0) + 1; saveWarnlist();
if (warnDatabase[sender] >= CONFIG.maxWarnLimit) {
blacklist.add(sender); saveBlacklist(); delete warnDatabase[sender]; saveWarnlist();
await sock.sendMessage(from, { text: 🚨 ${userTag} *Banned! Melanggar batas aturan toxic.*, mentions: [sender] });
await sock.groupParticipantsUpdate(from, [sender], 'remove');
} else {
await sock.sendMessage(from, { text: ⚠️ ${userTag} *Dilarang toxic!* Pesan dihapus. Warn: *[${warnDatabase[sender]}/${CONFIG.maxWarnLimit}]*, mentions: [sender] });
}
return;
}
if (CONFIG.antiLink && (text.includes('http://') || text.includes('https://') || text.includes('wa.me/'))) {
if (!text.includes(CONFIG.groupLinkWhitelist)) {
await sock.sendMessage(from, { delete: msg.key });
blacklist.add(sender); saveBlacklist();
await sock.sendMessage(from, { text: 🚨 ${userTag} *Di-kick karena menyebarkan link luar!*, mentions: [sender] });
await sock.groupParticipantsUpdate(from, [sender], 'remove');
return;
}
}
if (CONFIG.antiMediaBiasa) {
const mediaDilarang = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'];
if (mediaDilarang.includes(type)) {
const isViewOnce = msg.message.imageMessage?.viewOnce || msg.message.videoMessage?.viewOnce;
if (!isViewOnce) { await sock.sendMessage(from, { delete: msg.key }); return; }
}
}
}
if (text === '.slot') {
const slotIcons = ['🍊', '🍇', '🍒', '💎', '🔔', '7️⃣'];
const x = slotIcons[Math.floor(Math.random() * slotIcons.length)];
const y = slotIcons[Math.floor(Math.random() * slotIcons.length)];
const z = slotIcons[Math.floor(Math.random() * slotIcons.length)];
let res = x === y && y === z ? '🎉 JACKPOT UTAMA!' : (x === y || y === z || x === z ? '✨ Hampir Menang (2 Kembar)!' : '❌ Kalah! Coba lagi.');
await sock.sendMessage(from, { text: 🎰 *[ MINI-SLOT ]* 🎰\n\n  [ ${x} | ${y} | ${z} ]\n\nUser: ${userTag}\nResult: ${res}, mentions: [sender] });
return;
}
if (text === '.mahjong') {
const nagaIcons = ['🐉 (Naga Hijau)', '🀄 (Tengah Merah)', '🪙 (Koin Emas)', '🎋 (Bambu Hoki)', '🀘 (Naga Putih)'];
const res = nagaIcons[Math.floor(Math.random() * nagaIcons.length)];
await sock.sendMessage(from, { text: 🀄 *[ MAHJONG NAGA ]* 🀄\n\nKartu kamu: *${res}*\nUser: ${userTag}, mentions: [sender] });
return;
}
});
}
startBot();
