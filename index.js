const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

// ==========================================
// ⚙️ KONFIGURASI UTAMA BOT ARVX 588
// ==========================================
const CONFIG = {
    botName: 'TOTAL-GUARD ARVX 588',
    groupLinkWhitelist: 'https://chat.whatsapp.com/IcECPgfBoCT0HT78QJxoyr?s=cl&p=a&mlu=4&ilr=4',
    adminNumber: '628157159957@s.whatsapp.net', // Nomor WA utama kamu
    welcomeMessage: '『  𝐈𝐍𝐓𝐑𝐎 𝐂𝐀𝐑Ｄ — ＡＲ𝐕𝐗 588  』\n\nWelcome to ARVX 588.\n\n━━━━━━━━━━━━━━\nNama :\nUmur :\nGender :\nAsal :\nTag admin :\n━━━━━━━━━━━━━━\n📸 Kirim poto 1× liat ( bebas)\n\nHalo @user 👋 Selamat bergabung! Silakan isi kartu intro di atas ya.\nTautan Resmi Grup: https://chat.whatsapp.com/IcECPgfBoCT0HT78QJxoyr?s=cl&p=a&mlu=4&ilr=4',
    goodbyeMessage: 'Selamat tinggal *@user* 🕊️, terima kasih telah mampir di ARVX 588.',
    antiLink: true,
    antiMediaBiasa: true,
    maxChatLimit: 5,
    floodCooldown: 4000,
    maxWarnLimit: 3, // Batas maksimal peringatan sebelum di-kick
    // Daftar kata kasar yang otomatis disensor (bisa kamu tambahkan sesuai kebutuhan)
    toxicWords: ['anjing', 'anjg', 'bangsat', 'bgsd', 'kontol', 'kntl', 'memek', 'mmk', 'goblok', 'gblg', 'tolol']
};

// Database internal berbasis JSON lokal
if (!fs.existsSync('blacklist.json')) fs.writeFileSync('blacklist.json', '[]');
if (!fs.existsSync('warnlist.json')) fs.writeFileSync('warnlist.json', '{}');

const blacklist = new Set(JSON.parse(fs.readFileSync('blacklist.json', 'utf-8')));
const warnDatabase = JSON.parse(fs.readFileSync('warnlist.json', 'utf-8'));
const floodTracker = new Map();

function saveBlacklist() {
    fs.writeFileSync('blacklist.json', JSON.stringify(Array.from(blacklist), null, 2));
}
function saveWarnlist() {
    fs.writeFileSync('warnlist.json', JSON.stringify(warnDatabase, null, 2));
}

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

    // ==========================================
    // ⚡ SISTEM MERENDER QR DI LOGS ZEABUR
    // ==========================================
    let qrGenerated = false;
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !qrGenerated) {
            console.log('\n============================================================');
            console.log('🔥 [READY] KODE QR SEGAR TELAH DIRENTAS! SILAKAN SCAN SEKARANG:');
            console.log('============================================================\n');
            qrcode.generate(qr, { small: true });
            qrGenerated = true;
        }
        
        if (connection === 'close') {
            qrGenerated = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('⚠️ Koneksi terputus. Menghubungkan ulang dalam 5 detik...');
                setTimeout(() => startBot(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ BOOM! KONEKSI TERKUNCI PERMANEN! BOT GUARD ARVX 588 ONLINE 24 JAM!');
        }
    });

    // Otomatis Tolak Panggilan Telepon
    sock.ev.on('call', async (callUpdate) => {
        for (let call of callUpdate) {
            if (call.status === 'offer') {
                await sock.rejectCall(call.id, call.from);
                await sock.sendMessage(call.from, { text: '⚠️ *Maaf, Bot tidak menerima panggilan.*' });
            }
        }
    });

    // Welcome & Goodbye Handler dengan Proteksi Blacklist Otomatis
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        for (let num of participants) {
            const userTag = '@' + num.split('@')[0];
            if (action === 'add') {
                if (blacklist.has(num)) {
                    await sock.sendMessage(id, { text: '🚨 Nomor ' + userTag + ' masuk daftar hitam ARVX 588! Mengeluarkan...', mentions: [num] });
                    await sock.groupParticipantsUpdate(id, [num], 'remove');
                    continue;
                }
                if (CONFIG.welcomeMessage) {
                    await sock.sendMessage(id, { text: CONFIG.welcomeMessage.replace('@user', userTag), mentions: [num] });
                }
            } else if (action === 'remove') {
                await sock.sendMessage(id, { text: CONFIG.goodbyeMessage.replace('@user', userTag), mentions: [num] });
            }
        }
    });

    // Pemroses Utama Pesan Masuk
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
        const userTag = '@' + sender.split('@')[0];

        let isGroupAdmin = false;
        try {
            const groupMeta = await sock.groupMetadata(from);
            const participant = groupMeta.participants.find(p => p.id === sender);
            isGroupAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
        } catch (e) {}

        // ==========================================
        // 🛡️ FITUR KEAMANAN GRUP MASSA (ANTI-VIOLATION)
        // ==========================================

        // 1. Anti-Tag All / Anti-Hidetag untuk Anggota Biasa
        const mentions = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (!isGroupAdmin && sender !== CONFIG.adminNumber) {
            // Jika mendeteksi jumlah tag massal (lebih dari 7 nomor sekali kirim) atau hidetag khusus
            if (mentions.length > 7 || msg.message.extendedTextMessage?.contextInfo?.isForwarded) {
                await sock.sendMessage(from, { delete: msg.key });
                await sock.sendMessage(from, { text: `⚠️ ${userTag} *Dilarang keras melakukan spam tag massal/hidetag di grup ini!*`, mentions: [sender] });
                return;
            }
        }

        // 2. Anti-Toxic Word Filter (Sensor Kata Kasar) + Sistem Peringatan (Warn)
        if (!isGroupAdmin && sender !== CONFIG.adminNumber) {
            const cleanText = text.toLowerCase();
            const containsToxic = CONFIG.toxicWords.some(word => cleanText.includes(word));
            
            if (containsToxic) {
                await sock.sendMessage(from, { delete: msg.key });
                
                // Tambah Poin Peringatan (Warn)
                warnDatabase[sender] = (warnDatabase[sender] || 0) + 1;
                saveWarnlist();
                
                if (warnDatabase[sender] >= CONFIG.maxWarnLimit) {
                    blacklist.add(sender);
                    saveBlacklist();
                    delete warnDatabase[sender];
                    saveWarnlist();
                    await sock.sendMessage(from, { text: `🚨 ${userTag} *Telah mencapai batas maksimal 3x peringatan karena toxic/melanggar aturan! Mengeluarkan otomatis & Blacklist permanen!*`, mentions: [sender] });
                    await sock.groupParticipantsUpdate(from, [sender], 'remove');
                } else {
                    await sock.sendMessage(from, { text: `⚠️ ${userTag} *Dilarang berkata kasar/toxic!* pesan Anda dihapus.\nStatus Peringatan Anda: *[${warnDatabase[sender]}/${CONFIG.maxWarnLimit}]*`, mentions: [sender] });
                }
                return;
            }
        }

        // 3. Proteksi Anti-Spam Flood Chat
        let userChats = floodTracker.get(sender) || [];
        userChats = userChats.filter(timestamp => now - timestamp < CONFIG.floodCooldown);
        userChats.push(now);
        floodTracker.set(sender, userChats);

        if (userChats.length > CONFIG.maxChatLimit && !isGroupAdmin && sender !== CONFIG.adminNumber) {
            await sock.sendMessage(from, { delete: msg.key });
            blacklist.add(sender);
            saveBlacklist();
            await sock.sendMessage(from, { text: `🚨 ${userTag} *Otomatis dikeluarkan & daftar hitam karena membanjiri chat grup (Flood Spam)!*`, mentions: [sender] });
            await sock.groupParticipantsUpdate(from, [sender], 'remove');
            return;
        }

        // 4. Proteksi Anti-Link Grup Luar
        if (CONFIG.antiLink && !isGroupAdmin && sender !== CONFIG.adminNumber && (text.includes('http://') || text.includes('https://') || text.includes('wa.me/'))) {
            if (!text.includes(CONFIG.groupLinkWhitelist)) {
                await sock.sendMessage(from, { delete: msg.key });
                blacklist.add(sender);
                saveBlacklist();
                await sock.sendMessage(from, { text: `🚨 ${userTag} *Otomatis dikeluarkan karena menyebarkan tautan/link ilegal luar grup!*`, mentions: [sender] });
                await sock.groupParticipantsUpdate(from, [sender], 'remove');
                return;
            }
        }

        // 5. Proteksi Anti-Media Biasa (Wajib View Once)
if (CONFIG.antiMediaBiasa && !isGroupAdmin && sender !== CONFIG.adminNumber) {
const mediaDilarang = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'];
if (mediaDilarang.includes(type)) {
const isViewOnce = msg.message.imageMessage?.viewOnce || msg.message.videoMessage?.viewOnce;
if (!isViewOnce) {
await sock.sendMessage(from, { delete: msg.key });
await sock.sendMessage(from, { text: ⚠️ ${userTag} *Kirim foto/video biasa dilarang! Wajib menggunakan fitur 1x Lihat (View Once) demi privasi grup!*, mentions: [sender] });
return;
}
}
}
// ==========================================
// 🎮 FITUR INTERAKTIF & HIBURAN KOMUNITAS
// ==========================================
// 1. Mini Game Simulating Slot
if (text === '.slot') {
const slotIcons = ['🍊', '🍇', '🍒', '💎', '🔔', '7️⃣'];
const x = slotIcons[Math.floor(Math.random() * slotIcons.length)];
const y = slotIcons[Math.floor(Math.random() * slotIcons.length)];
const z = slotIcons[Math.floor(Math.random() * slotIcons.length)];
let statusResult = '❌ Anda Kalah! Coba lagi peruntunganmu.';
if (x === y && y === z) {
statusResult = '🎉 JACKPOT BESAR! Kamu luar biasa beruntung!';
} else if (x === y || y === z || x === z) {
statusResult = '✨ Hampir Menang! Dapat 2 Kecocokan Kembar!';
}
await sock.sendMessage(from, { text: 🎰 *[ ARVX MINI-SLOT ]* 🎰\n\n  [ ${x} | ${y} | ${z} ]\n\nUser: ${userTag}\nResult: ${statusResult}, mentions: [sender] });
return;
}
// 2. Mini Game Simulating Mahjong
if (text === '.mahjong') {
const nagaIcons = ['🐉 (Naga Hijau)', '🀄 (Tengah Merah)', '🪙 (Koin Kemakmuran)', '🎋 (Bambu Keberuntungan)', '🀘 (Naga Putih)'];
const res = nagaIcons[Math.floor(Math.random() * nagaIcons.length)];
await sock.sendMessage(from, { text: 🀄 *[ ARVX MAHJONG NAGA ]* 🀄\n\nKamu menarik ubin kartu keberuntungan hari ini:\n👉 *${res}*\n\nUser: ${userTag}\nSemoga harimu penuh hoki keberuntungan!, mentions: [sender] });
return;
}
// ==========================================
// 👑 UTILITAS PERINTAH ADMIN UTAMA / ADMIN GRUP
// ==========================================
if (sender === CONFIG.adminNumber || isGroupAdmin) {
if (text === '.rules') {
await sock.sendMessage(from, { text: CONFIG.welcomeMessage.replace('@user', 'Semua Anggota') });
return;
}
if (text === '.cekblacklist') {
const list = Array.from(blacklist).map(num => '@' + num.split('@')[0]);
await sock.sendMessage(from, { text: '📋 Daftar Hitam ARVX 588:\n\n' + (list.length > 0 ? list.join('\n') : 'Kosong'), mentions: Array.from(blacklist) });
return;
}
if (text.startsWith('.resetwarn ')) {
const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid[0];
if (target && warnDatabase[target]) {
delete warnDatabase[target];
saveWarnlist();
await sock.sendMessage(from, { text: ✅ Berhasil membersihkan poin pelanggaran untuk nomor @${target.split('@')[0]}., mentions: [target] });
}
return;
}
}
});
}
startBot();
