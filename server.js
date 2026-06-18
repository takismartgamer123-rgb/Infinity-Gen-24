require('dotenv').config();
const express = require('express');
const { createClient } = require('redis');
const { google } = require('googleapis');
const app = express();
const PORT = process.env.PORT || 3000;

// ===== 1. منع الرقاد =====
setInterval(() => {
    fetch(`https://${process.env.RENDER_EXTERNAL_URL}`).catch(()=>{});
}, 14 * 60 * 1000);

// ===== 2. Redis =====
const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', (err) => console.log('Redis Error:', err));
redis.connect().then(() => console.log('✅ Redis متصل ♾️'));

// ===== 3. يوتيوب =====
const oauth2Client = new google.auth.OAuth2(process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

let liveChatId = null;
let nextPageToken = null;
let games = {};

// ===== 4. دوال قاعدة البيانات =====
async function addPoints(channelId, username, amount = 1) {
    const key = `user:${channelId}`;
    await redis.hIncrBy(key, 'points', amount);
    await redis.hSet(key, 'username', username);
    const points = await redis.hGet(key, 'points');
    await redis.zAdd('leaderboard', { score: parseInt(points), value: channelId });
    return parseInt(points);
}

async function getUser(channelId) {
    const user = await redis.hGetAll(`user:${channelId}`);
    return {
        username: user.username || 'بطل',
        points: parseInt(user.points) || 0,
        inventory: user.inventory? user.inventory.split(',').filter(i => i) : [],
        wins: parseInt(user.wins) || 0
    };
}

async function buyItem(channelId, itemName, cost) {
    const user = await getUser(channelId);
    if (user.points < cost) return { success: false, msg: `تقي: يا ${user.username} رصيدك ما يكفيش 🗿 تحتاج ${cost - user.points} نقطة زيادة ♾️` };
    await redis.hIncrBy(`user:${channelId}`, 'points', -cost);
    await redis.hSet(`user:${channelId}`, 'inventory', [...user.inventory, itemName].join(','));
    return { success: true, msg: `تقي: مبروك يا ${user.username} شريت ${itemName} ✅ باممممم ♾️` };
}

// ===== 5. كلمات و أسئلة الألعاب =====
const gameData = {
    words: ['باممممم', 'جلاد', 'قالمة', 'نووي', 'متجر', 'تقي', 'انفينيتي'],
    questions: [
        { q: 'عاصمة الجزائر؟', a: 'الجزائر' },
        { q: '1+1؟', a: '2' },
        { q: 'وش معنى باممممم؟', a: 'جلد' }
    ],
    shop: [
        { name: 'درع حماية', cost: 500, emoji: '🛡️' },
        { name: 'كشف دور', cost: 800, emoji: '🔍' },
        { name: 'سرقة نقاط', cost: 1200, emoji: '🥷' },
        { name: 'قنبلة نووية', cost: 2000, emoji: '💣' }
    ]
};

// ===== 6. UI الألعاب - نسخة نظيفة =====
const gameUI = {
    xo: (b) => {
        const c = (i) => b[i] === 'X'? '❌' : b[i] === 'O'? '⭕' : '⬜';
        return `🎮 XO - دورك ♾️\n${c(0)} | ${c(1)} | ${c(2)}\n─────────\n${c(3)} | ${c(4)} | ${c(5)}\n─────────\n${c(6)} | ${c(7)} | ${c(8)}\nتقي: اكتب "نلعب 5" بامممم`;
    },
    shop: (u) => `☢️ المتجر النووي ☢️\n${u.username}: ${u.points}💰\n─────────────────────\n${gameData.shop.map((i,idx)=>`${idx+1}. ${i.name} ${i.cost} ${i.emoji}`).join('\n')}\n─────────────────────\nتقي: قول "نشري درع" باممممم 😏`,
    wheel: (p) => `🎡 عجلة الحظ 🎡\n${p} راك تدور...\n${Math.random()>0.5?'ربحت +200 نقطة 🔥':'ربحت +20 نقطة تشجيعية ♾️'}\nتقي: الزهر معاك باممممم`
};

// ===== 7. ارسال رسالة =====
async function sendMessage(text) {
    if (!liveChatId) return;
    try {
        await youtube.liveChatMessages.insert({
            part: 'snippet',
            requestBody: {
                snippet: {
                    liveChatId,
                    type: 'textMessageEvent',
                    textMessageDetails: { messageText: text }
                }
            }
        });
    } catch (e) {
        console.log('Send Error:', e.message);
    }
}

// ===== 8. معالج الرسائل - نسخة كيوت =====
async function handleMessage(item) {
    const authorId = item.authorDetails.channelId;
    const rawMsg = item.snippet.displayMessage;
    const msg = rawMsg.toLowerCase();
    const authorName = item.authorDetails.displayName;

    // تجاهل رسائل البوت نفسه
    if (authorId === 'UCOQtQKhAwESsZW3DVnTxirw') return;

    // 1. زيد النقاط للناس العادية برك
    await addPoints(authorId, authorName, 1);

    // شخصية تقي - نسخة محترمة كيوت
    if (msg.includes('تقي') && msg.match(/حمار|كلب/)) {
        return sendMessage(`تقي: يا ${authorName} خليك محترم يا بطل 🗿♾️\nنلعبو بلا زعاف بامممم`);
    }

    // 2. أوامر أساسية
    if (msg.match(/سلام|مرحبا|اهلا/))
        return sendMessage(`وعليكم السلام يا ${authorName} 🗿\nتقي: نورت INFINITY GEN من قالمة 🔥♾️`);

    if (msg.match(/نقاط|نقطة|شنطة|شحال|قداه|رصيد/)) {
        const u = await getUser(authorId);
        const rank = await redis.zRevRank('leaderboard', authorId);
        return sendMessage(`💰 ${u.username} يا بطل 😏\n┌─────────────────┐\n│ النقاط: ${u.points} 💎 │\n│ الترتيب: #${rank!==null?rank+1:'جديد'} 🗿│\n│ الشنطة: ${u.inventory.join(', ')||'فارغة'} 🎒│\n└─────────────────┘\nتقي: راك جلاد بامممم ♾️`);
    }

    if (msg.match(/توب|ترتيب|الاول/)) {
        const top = await redis.zRangeWithScores('leaderboard', -10, -1, { REV: true });
        let topMsg = '🏆 توب 10 أبطال 🏆\n┌─────────────────────────┐\n';
        for (let i = 0; i < top.length; i++) {
            const user = await redis.hGet(`user:${top[i].value}`, 'username');
            topMsg += `│ ${i+1}. ${user||'مجهول'} - ${top[i].score}💎\n`;
        }
        return sendMessage(topMsg + '└─────────────────────────┘\nتقي: هاذو الأبطال باممممم ♾️🗿');
    }

    // 3. المتجر النووي
    if (msg.match(/متجر|محل|حانوت/)) {
        if (msg.includes('نشري')) {
            const item = gameData.shop.find(i => msg.includes(i.name.split(' ')[0].toLowerCase()));
            if (item) {
                const res = await buyItem(authorId, item.name, item.cost);
                return sendMessage(res.msg);
            }
        }
        const u = await getUser(authorId);
        return sendMessage(gameUI.shop(u));
    }

    // 4. الألعاب 1-8
    // XO
    if (msg.match(/xo|اكس او/)) {
        games.xo = games.xo || { board: Array(9).fill(0).map((_,i)=>i+1), players: [] };
        return sendMessage(`🎮 ${authorName} بدا XO 🔥\n${gameUI.xo(games.xo.board)}\nتقي: قول "نلعب 5" باممممم`);
    }

    if (msg.match(/نلعب\s*[1-9]/) && games.xo) {
        const pos = parseInt(msg.match(/[1-9]/)[0]) - 1;
        if (isNaN(games.xo.board[pos])) return sendMessage(`تقي: يا ${authorName} الخانة محجوزة 🗿♾️`);
        games.xo.board[pos] = games.xo.players.length % 2 === 0? 'X' : 'O';
        games.xo.players.push(authorId);
        return sendMessage(`${gameUI.xo(games.xo.board)}\nتقي: لي بعدو يلعب باممممم`);
    }

    // حجر ورقة مقص
    if (msg.match(/حجر|ورقة|مقص/)) {
        const choices = ['حجر🪨','ورقة📄','مقص✂️'];
        const bot = choices[Math.floor(Math.random()*3)];
        const user = msg.includes('حجر')?'حجر🪨':msg.includes('ورقة')?'ورقة📄':'مقص✂️';
        await addPoints(authorId, authorName, 30);
        return sendMessage(`✂️ ${authorName} ضد تقي 📄\nانت: ${user}\nتقي: ${bot}\n+30 نقطة باممممم 🔥♾️`);
    }

    // تخمين رقم
    if (msg.includes('تخمين')) {
        if (msg.match(/\d+/)) {
            const guess = parseInt(msg.match(/\d+/)[0]);
            if (!games.takhmin?.[authorId]) return sendMessage(`تقي: ابدا اللعبة بـ "تخمين" قبل يا بطل 🗿♾️`);
            const num = games.takhmin[authorId];
            if (guess === num) {
                delete games.takhmin[authorId];
                await addPoints(authorId, authorName, 100);
                return sendMessage(`🎉 باممممم يا ${authorName} صحيح! ${num}\n+100 نقطة 🔥♾️`);
            }
            return sendMessage(`تقي: ${guess<num?'أكبر':'أصغر'} من ${guess} يا ${authorName} 🗿`);
        }
        games.takhmin = games.takhmin || {};
        games.takhmin[authorId] = Math.floor(Math.random()*100)+1;
        return sendMessage(`🎯 ${authorName} لعبة تخمين 🔥\nتقي خير رقم 1-100\nاكتب "تخمين 50" باممممم ♾️`);
    }

    // كلمة
    if (msg.includes('كلمة')) {
        const word = gameData.words[Math.floor(Math.random()*gameData.words.length)];
        const hidden = word.split('').map(c=>Math.random()>0.5?c:'_').join(' ');
        games.word = { word, authorId };
        return sendMessage(`📝 خمن الكلمة: ${hidden}\nتقي: لي يجاوب صحيح +80 نقطة باممممم ♾️`);
    }

    if (games.word && msg.includes(games.word.word)) {
        delete games.word;
        await addPoints(authorId, authorName, 80);
        return sendMessage(`🎉 ${authorName} جبتها صح! +80 نقطة 🔥\nتقي: راك ذكي باممممم 🗿♾️`);
    }

    // عجلة الحظ - كيوت بلا خسارة
    if (msg.includes('عجلة')) {
        const win = Math.random()>0.4;
        await addPoints(authorId, authorName, win?200:20);
        return sendMessage(`🎡 ${authorName} دور العجلة...\n${win?'ربحت +200 🔥':'ربحت +20 نقطة تشجيعية ♾️'}\nتقي: الزهر معاك باممممم`);
    }

    // سؤال
    if (msg.includes('سؤال')) {
        const q = gameData.questions[Math.floor(Math.random()*gameData.questions.length)];
        games.question = { a: q.a.toLowerCase(), authorId };
        return sendMessage(`❓ سؤال: ${q.q}\nتقي: جاوب تربح +70 باممممم ♾️`);
    }

    if (games.question && msg.includes(games.question.a)) {
        delete games.question;
        await addPoints(authorId, authorName, 70);
        return sendMessage(`✅ ${authorName} صحيح! +70 نقطة 🔥\nتقي: راك مثقف باممممم 🗿♾️`);
    }

    // كتابة سريعة
    if (msg.includes('كتابة')) {
        const word = 'باممممم تقي الجلاد';
        games.typing = { word, start: Date.now() };
        return sendMessage(`⌨️ اكتب بسرعة: ${word}\nتقي: لي يكتبها اول +90 نقطة ♾️`);
    }

    if (games.typing && rawMsg === games.typing.word) {
        const time = ((Date.now()-games.typing.start)/1000).toFixed(1);
        delete games.typing;
        await addPoints(authorId, authorName, 90);
        return sendMessage(`⚡ ${authorName} في ${time}ث! +90 نقطة 🔥\nتقي: يدك خفيفة باممممم ♾️`);
    }

    // كلمات
    if (msg.includes('كلمات') && msg.match(/\w{3,}/)) {
        await addPoints(authorId, authorName, 10);
        return sendMessage(`📚 ${authorName} كتبت كلمة +10 نقاط\nتقي: زيد كلمات باممممم ♾️`);
    }

    // 5. الألعاب 9-16 - نسخة كيوت
    if (msg.includes('مليون')) return sendMessage(`💰 ${authorName} لعبة المليون\nتقي: السؤال الجاي قريبا... +10 نقاط تشجيعية ضرك ♾️😂`);
    if (msg.includes('كنز')) return sendMessage(`🗺️ ${authorName} تدور على كنز\nتقي: لقيت 150 نقطة في قالمة 🔥♾️`);
    if (msg.includes('سجن')) return sendMessage(`⛓️ ${authorName} دخلت السجن\nتقي: تخرج بعد 3 رسايل باممممم 🗿♾️`);
    if (msg.includes('سرعة')) {
        games.speed = true;
        return sendMessage(`⚡ ${authorName} اختبار سرعة\nتقي: اكتب "انا بطل" ضرك! ♾️`);
    }
    if (msg.includes('انا بطل') && games.speed) {
        delete games.speed;
        await addPoints(authorId, authorName, 60);
        return sendMessage(`⚡ سريع يا بطل! +60 🔥♾️`);
    }
    if (msg.includes('قاتل')) return sendMessage(`🔪 ${authorName} دخلت لعبة القاتل\nتقي: دورك مخفي باممممم ♾️`);
    if (msg.includes('بورصة')) return sendMessage(`📈 ${authorName} البورصة طلعت\nنقاطك زادت +5% باممممم 🔥♾️`);
    if (msg.includes('مملكة')) return sendMessage(`👑 ${authorName} اسست مملكة\nتقي: راك الملك ضرك باممممم 🗿♾️`);

    // 6. أوامر
    if (msg.match(/اوامر|وش كاين/)) {
        return sendMessage(`📜 اوامر INFINITY GEN 📜\n─────────────────────\nنقاطي - شنطتك\nتوب - الترتيب\nمتجر - شراء\nxo - لعبة\nتخمين - رقم\nسؤال - ثقافة\nعجلة - حظ\nكلمة - تخمين\n─────────────────────\nتقي: 16 لعبة كاملة باممممم 🔥♾️`);
    }
}

// ===== 9. تشغيل =====
async function pollChat() {
    if (!liveChatId) return;
    try {
        const res = await youtube.liveChatMessages.list({
            liveChatId: liveChatId,
            part: 'snippet,authorDetails',
            pageToken: nextPageToken
        });
        nextPageToken = res.data.nextPageToken;
        for (const item of res.data.items) await handleMessage(item);
        setTimeout(pollChat, res.data.pollingIntervalMillis);
    } catch (e) {
        setTimeout(pollChat, 5000);
    }
}

async function startBot() {
    try {
        const res = await youtube.videos.list({
            part: 'liveStreamingDetails',
            id: process.env.YOUTUBE_VIDEO_ID
        });
        liveChatId = res.data.items[0].liveStreamingDetails.activeLiveChatId;
        console.log('🎮 البوت دخل بنجاح ♾️');
        sendMessage('✨ INFINITY GEN V1.0 دخل الشات ✨\nتقي: مرحبا بيكم يا أبطال 🔥 16 لعبة تستناكم\nقول "سلام" نبداو باممممم ♾️');
        pollChat();
    } catch (e) {
        console.log('💀 فشل التشغيل:', e.message);
    }
}

app.get('/', (req, res) => res.send(`INFINITY GEN V1.0 شغال ♾️ 16 لعبة كيوت`));
app.listen(PORT, () => {
    console.log(`🚀 السرفر طاير على ${PORT} ♾️`);
    setTimeout(startBot, 80000);
});
