const express = require('express');
const { google } = require('googleapis');
const { createClient } = require('redis');
require('dotenv').config();

const app = express();
app.use(express.json());

const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', (err) => console.error('Redis Error', err));

const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

let liveChatId = null;
let nextPageToken = null;

// ================= V3.0 CONFIG =================
const BOT_ID = 'TAKI_BOT_V3';
const BOT_NAME = 'تقي V3 🤖';
const BOT_JOIN_TIME = 60000; // V3.0 أسرع: 60ث بدل 80ث
const MSG_REWARD = 2; // V3.0 نقاط أكثر
const BOT_CHANNEL_ID = process.env.YOUTUBE_BOT_CHANNEL_ID;
const VERSION = 'V3.0';

const MILLION_Q = [
    {q:'عاصمة الجزائر؟',a:['وهران','قاالمة','الجزائر','قسنطينة'],c:2,p:50},
    {q:'5+5*2؟',a:['20','15','10','25'],c:1,p:50},
    {q:'بوس ماينكرافت الأخير؟',a:['واردن','إندر دراجون','ويذر','تقي'],c:1,p:100},
    {q:'أسرع حيوان؟',a:['فهد','نمر','أسد','غزال'],c:0,p:75},
    {q:'كم حرف في "شكشوكة"؟',a:['5','6','7','8'],c:2,p:50}
];

// V3.0 متجر أكبر + عناصر جديدة
const SHOP = {
    'درع':{price:200,desc:'يحمي من السرقة 100%'},
    'مضاعف':{price:500,desc:'نقاط x3 لـ10د - V3'},
    'كشف':{price:150,desc:'كشف الجاسوس'},
    'قنبلة':{price:400,desc:'تنقص خصم -100'},
    'كاتم':{price:600,desc:'تسكت لاعب 5د'},
    'درع_شرطي':{price:500,desc:'حماية من المافيا'},
    'إنعاش':{price:700,desc:'رجوع للحياة'},
    'تصويت_ذهبي':{price:350,desc:'تصويتك = 3'},
    'جاسوس':{price:800,desc:'كشف دور لاعب'},
    'انتحاري':{price:1000,desc:'تفجر 3 معاك'},
    'تجميد':{price:900,desc:'جمد لعبة خصم - جديد V3'},
    'سرقة':{price:1200,desc:'اسرق 50% نقاط خصم - جديد V3'}
};

// ================= Anti-Shakshouka V3.0 =================
const sendMessage = async (text) => {
    if (!liveChatId) return;
    try {
        // V3.0: فلتر أقوى ضد الشكشوكة
        const cleanText = text
           .replace(/\n/g, ' | ')
           .replace(/\s{2,}/g, ' ')
           .replace(/[^\u0000-\u007F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s|🤖💎♾️👑⚔️🎮🎲🎡📖⌨️💰📝🗺️⚡📈🎭🃏🔥]/g, '')
           .slice(0, 190);
        const finalText = `${cleanText} ♾️`;

        await youtube.liveChatMessages.insert({
            part: 'snippet',
            requestBody: {
                snippet: {
                    liveChatId: liveChatId,
                    type: 'textMessageEvent',
                    textMessageDetails: { messageText: finalText }
                }
            }
        });
    } catch (error) {
        console.error('Send Error:', error.message);
        if (error.message.includes('quota')) {
            console.log('💀 الكوتا خلاصت - V3.0');
        }
    }
};

// ================= Redis V3.0 =================
const getUser = async (id, username) => {
    const key = `user:${id}`;
    const exists = await redis.exists(key);
    if (!exists) {
        await redis.hSet(key, {
            username: username,
            points: 100, // V3.0 بونص بداية
            inventory: '[]',
            shield: 0,
            x2: 0,
            wins: 0,
            games: 0
        });
    }
    const user = await redis.hGetAll(key);
    user.points = parseInt(user.points) || 0;
    user.inventory = JSON.parse(user.inventory || '[]');
    user.shield = parseInt(user.shield) || 0;
    user.x2 = parseInt(user.x2) || 0;
    user.wins = parseInt(user.wins) || 0;
    user.games = parseInt(user.games) || 0;
    return user;
};

const addPoints = async (id, amount, reason = '') => {
    const user = await redis.hGetAll(`user:${id}`);
    let finalAmount = amount;
    // V3.0: x3 بدل x2
    if (Date.now() < parseInt(user.x2 || 0) && amount > 0) finalAmount *= 3;
    const newTotal = await redis.hIncrBy(`user:${id}`, 'points', finalAmount);
    await redis.zAdd('leaderboard', { score: newTotal, value: id });
    if (reason) console.log(`[POINTS] ${id}: ${amount} → ${finalAmount} (${reason})`);
    return finalAmount;
};

// ================= XO V3.0 =================
const xoRender = (b) => {
    const c = (i) => b[i] === 'X'? '❌' : b[i] === 'O'? '⭕' : i + 1;
    return `${c(0)}${c(1)}${c(2)} | ${c(3)}${c(4)}${c(5)} | ${c(6)}${c(7)}${c(8)}`;
};

const checkWin = (b) => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for(let l of lines) if(b[l[0]] && b[l[0]]===b[l[1]] && b[l[0]]===b[l[2]]) return b[l[0]];
    return b.includes('')? null : 'draw';
};

// V3.0: بوت أذكى بـ Minimax
const botMoveXO = (b) => {
    const minimax = (board, depth, isMax) => {
        const winner = checkWin(board);
        if (winner === 'O') return 10 - depth;
        if (winner === 'X') return depth - 10;
        if (winner === 'draw') return 0;

        if (isMax) {
            let best = -Infinity;
            for (let i = 0; i < 9; i++) {
                if (!board[i]) {
                    board[i] = 'O';
                    best = Math.max(best, minimax(board, depth + 1, false));
                    board[i] = '';
                }
            }
            return best;
        } else {
            let best = Infinity;
            for (let i = 0; i < 9; i++) {
                if (!board[i]) {
                    board[i] = 'X';
                    best = Math.min(best, minimax(board, depth + 1, true));
                    board[i] = '';
                }
            }
            return best;
        }
    };

    let bestMove = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < 9; i++) {
        if (!b[i]) {
            b[i] = 'O';
            let moveVal = minimax(b, 0, false);
            b[i] = '';
            if (moveVal > bestVal) {
                bestMove = i;
                bestVal = moveVal;
            }
        }
    }
    return bestMove;
};

// ================= Multiplayer V3.0 =================
const createGame = async (type, authorId, authorName, data = {}) => {
    const gameId = `game:${type}_${authorId}_${Date.now()}`;
    await redis.hSet(gameId, {
        type, p1: authorId, p1Name: authorName,
        status: 'waiting', created: Date.now(),
       ...data
    });
    await redis.expire(gameId, 600);
    await sendMessage(`🎮 ${authorName} فتح ${type}! اكتب 'ادخل' للانضمام | ${BOT_NAME} يدخل بعد 60ث`);
    setTimeout(() => startBotGame(gameId), BOT_JOIN_TIME);
    return gameId;
};

const startBotGame = async (gameId) => {
    const game = await redis.hGetAll(gameId);
    if (game.status === 'waiting') {
        await redis.hSet(gameId, {
            status: 'playing',
            p2: BOT_ID,
            p2Name: BOT_NAME,
            turn: game.p1,
            board: game.type === 'xo'? JSON.stringify(Array(9).fill('')) : ''
        });
        await sendMessage(`${BOT_NAME} دخل ${game.type} ضد ${game.p1Name}! بامممم`);
        if(game.type === 'xo') await sendMessage(`XO: ${xoRender(Array(9).fill(''))} | دور ${game.p1Name}`);
    }
};

const joinGame = async (authorId, authorName) => {
    const keys = await redis.keys('game:*');
    for (let key of keys) {
        const game = await redis.hGetAll(key);
        if (game.status === 'waiting' && game.p1!== authorId) {
            const updateData = {
                status: 'playing',
                p2: authorId,
                p2Name: authorName,
                turn: game.p1
            };
            if(game.type === 'xo') updateData.board = JSON.stringify(Array(9).fill(''));
            await redis.hSet(key, updateData);
            await sendMessage(`⚔️ ${authorName} دخل ${game.type}! ضد ${game.p1Name}`);
            if(game.type === 'xo') await sendMessage(`XO: ${xoRender(Array(9).fill(''))} | دور ${game.p1Name}`);
            return key;
        }
    }
    await sendMessage(`لا توجد ألعاب مفتوحة. ابدا بـ xo start`);
    return null;
};

// ================= معالج الرسائل V3.0 =================
const handleMessage = async (authorId, username, text) => {
    if (authorId === BOT_CHANNEL_ID) return; // Anti-Loop V3.0

    const user = await getUser(authorId, username);
    await addPoints(authorId, MSG_REWARD, 'رسالة');

    const args = text.trim().split(' ');
    const cmd = text.trim().toLowerCase();

    // الأوامر الأساسية V3.0
    if (cmd === 'سلام') return sendMessage(`وعليكم السلام يا ${username}! ${BOT_NAME} ${VERSION} شغال`);
    if (cmd === 'نقاطي') {
        const rank = await redis.zRevRank('leaderboard', authorId);
        return sendMessage(`💎 ${username} | ${user.points} نقطة | ترتيب #${rank!==null?rank+1:'جديد'} | فوز:${user.wins} | درع:${user.shield} | x3:${user.x2>Date.now()?'شغال':'طافي'}`);
    }
    if (cmd === 'توب') {
        const top = await redis.zRangeWithScores('leaderboard', -10, -1, {REV: true});
        const topText = top.map((t,i)=>`${i+1}.${t.value}(${t.score})`).join(' | ');
        return sendMessage(`🏆 التوب 10: ${topText}`);
    }
    if (cmd === 'متجر') return sendMessage(`🛒 المتجر V3: ${Object.entries(SHOP).map(([k,v])=>`${k}:${v}💎`).join(' | ')}`);
    if (cmd === 'شنطة') return sendMessage(`🎒 شنطتك: ${user.inventory.length? user.inventory.join(', ') : 'فارغة'} | انتصارات:${user.wins}`);

    if (cmd.startsWith('شراء ')) {
        const item = args[1];
        if (!SHOP[item]) return sendMessage(`❌ ${item} غير موجود بالمتجر`);
        if (user.points < SHOP[item]) return sendMessage(`❌ تحتاج ${SHOP[item]}💎 | رصيدك: ${user.points}💎`);
        await addPoints(authorId, -SHOP[item], `شراء ${item}`);
        user.inventory.push(item);
        await redis.hSet(`user:${authorId}`, 'inventory', JSON.stringify(user.inventory));
        if (item === 'مضاعف') await redis.hSet(`user:${authorId}`, 'x2', Date.now() + 600000);
        if (item === 'درع') await redis.hIncrBy(`user:${authorId}`, 'shield', 1);
        return sendMessage(`✅ شريت ${item}! رصيدك: ${user.points - SHOP[item]}💎`);
    }

    // V3.0: هجوم مملكة محسن
    if (cmd === 'هجوم مملكة') {
        const king = await redis.get('kingdom:king');
        const kingName = king? await redis.hGet(`user:${king}`, 'username') : 'لا أحد';
        if(king === authorId) return sendMessage(`👑 أنت الملك ${username}!`);
        if(user.points < 500) return sendMessage(`❌ تحتاج 500 نقطة للانقلاب! رصيدك: ${user.points}💎`);
        if(user.shield <= 0) return sendMessage(`❌ تحتاج درع للهجوم! اشتر من المتجر`);

        await redis.hIncrBy(`user:${authorId}`, 'shield', -1);
        if(Math.random() > 0.4) { // V3.0: 60% نجاح
            await redis.set('kingdom:king', authorId);
            await addPoints(authorId, -500, 'انقلاب');
            await addPoints(authorId, 400, 'نجاح الانقلاب');
            return sendMessage(`⚔️ انقلاب ناجح! ${username} الملك الجديد 👑 | -500 +400 نقطة`);
        } else {
            await addPoints(authorId, -500, 'فشل انقلاب');
            return sendMessage(`💀 فشل الانقلاب! خسرت 500 نقطة ودرع. الملك: ${kingName}`);
        }
    }

    // إدارة الألعاب V3.0
    const multiplayerKeys = await redis.keys('game:*');
    let gState = null, gameKey = null;
    for (let key of multiplayerKeys) {
        const g = await redis.hGetAll(key);
        if (g.p1 === authorId || g.p2 === authorId) {
            gState = g; gameKey = key; break;
        }
    }

    // XO Logic V3.0
    if (gState && gState.type === 'xo' && gState.status === 'playing' && gState.turn === authorId) {
        let move = parseInt(cmd) - 1;
        let board = JSON.parse(gState.board);
        if (move >= 0 && move <= 8 &&!board[move]) {
            board[move] = gState.p1 === authorId? 'X' : 'O';
            await redis.hIncrBy(`user:${authorId}`, 'games', 1);
            let win = checkWin(board);

            if (win) {
                await redis.del(gameKey);
                if (win!== 'draw') {
                    await addPoints(authorId, 100, 'فوز XO'); // V3.0: 100 بدل 50
                    await redis.hIncrBy(`user:${authorId}`, 'wins', 1);
                    return sendMessage(`🏆 ${username} فاز! +100 نقطة ${xoRender(board)}`);
                }
                return sendMessage(`🤝 تعادل! +10 للكل ${xoRender(board)}`);
            }

            const nextTurn = gState.p1 === authorId? gState.p2 : gState.p1;
            const nextName = gState.p1 === authorId? gState.p2Name : gState.p1Name;
            await redis.hSet(gameKey, { board: JSON.stringify(board), turn: nextTurn });

            if (nextTurn === BOT_ID) {
                await new Promise(r => setTimeout(r, 2000)); // V3.0: تفكير أطول
                let bMove = botMoveXO(board);
                if (bMove!== -1) board[bMove] = 'O';
                win = checkWin(board);
                await redis.hSet(gameKey, { board: JSON.stringify(board), turn: authorId });
                if (win) {
                    await redis.del(gameKey);
                    return sendMessage(`${win === 'draw'? '🤝 تعادل' : `💀 ${BOT_NAME} فاز`} ${xoRender(board)}`);
                }
                return sendMessage(`🤖 ${BOT_NAME} لعب ${bMove+1} | ${xoRender(board)} | دورك`);
            }
            return sendMessage(`${username} لعب ${move+1} | ${xoRender(board)} | دور ${nextName}`);
        }
    }

    // الألعاب الفردية V3.0
    const singleKey = `single:${authorId}`;
    const sGame = await redis.hGetAll(singleKey);
    if (sGame.type) {
        if (sGame.type === 'تخمين') {
            if(cmd === sGame.ans) {
                await addPoints(authorId, 150, 'تخمين'); // V3.0: 150
                await redis.del(singleKey);
                return sendMessage(`🎉 صحيح! الرقم ${sGame.ans} +150 نقطة`);
            } else {
                let t = parseInt(sGame.tries) - 1;
                if(t<=0){
                    await redis.del(singleKey);
                    return sendMessage(`💀 خسرت! الرقم كان ${sGame.ans}`);
                }
                await redis.hSet(singleKey, 'tries', t);
                return sendMessage(`❌ خطأ | باقي ${t} | ${parseInt(cmd) > parseInt(sGame.ans)? 'أقل' : 'أكبر'}`);
            }
        }

        if (['كلمة','كتابة','كلمات','سؤال','مليون','كنز','سرعة'].includes(sGame.type)) {
            if (cmd === sGame.ans.toLowerCase()) {
                let pts = parseInt(sGame.reward);
                if (sGame.type === 'كتابة' || sGame.type === 'سرعة') pts += 30; // V3.0: بونص أكبر
                await addPoints(authorId, pts, sGame.type);
                await redis.del(singleKey);
                return sendMessage(`✅ صحيح يا ${username}! +${pts} نقطة`);
            } else {
                let tries = parseInt(sGame.tries || 1) - 1;
                if(tries <= 0) {
                    await redis.del(singleKey);
                    return sendMessage(`❌ انتهت المحاولات! الجواب: ${sGame.ans}`);
                }
                await redis.hSet(singleKey, 'tries', tries);
                return sendMessage(`❌ خطأ! باقي ${tries}`);
            }
        }

        if (sGame.type === 'سجن' && cmd === 'هروب') {
            await redis.del(singleKey);
            return Math.random()>0.4? sendMessage(`🏃 نجحت في الهروب! +50 نقطة`) : sendMessage(`⛓️ فشلت! -20 نقطة`);
        }

        if (sGame.type === 'بورصة' && (cmd === 'صعود' || cmd === 'هبوط')) {
            let result = Math.random()>0.45? 'صعود' : 'هبوط'; // V3.0: 55% صعود
            await redis.del(singleKey);
            if(cmd === result) {
                await addPoints(authorId, 250, 'بورصة'); // V3.0: 250
                return sendMessage(`📈 توقع صحيح! السهم ${result} +250`);
            }
            await addPoints(authorId, -50, 'بورصة خسارة');
            return sendMessage(`📉 توقع خاطئ! السهم ${result} -50`);
        }
    }

    // بدء الألعاب V3.0 - 18 لعبة
    switch (cmd) {
        case 'xo start': return createGame('xo', authorId, username);
        case 'rps start': return createGame('rps', authorId, username);
        case 'ادخل': return joinGame(authorId, username);

        case 'start تخمين':
            await redis.hSet(singleKey, { type: 'تخمين', ans: Math.floor(Math.random()*100)+1, tries: 5 });
            await redis.expire(singleKey, 120);
            return sendMessage(`🎲 خمن رقم 1-100 | 5 محاولات | +150 نقطة`);

        case 'start كلمة':
            await redis.hSet(singleKey, { type: 'كلمة', ans: 'يوتيوب', tries: 3, reward: 100 });
            await redis.expire(singleKey, 120);
            return sendMessage(`📖 كلمة السر: ي.....ب | 3 محاولات | +100 نقطة`);

        case 'start عجلة':
            const prizes = [0,20,50,100,200,500,-50]; // V3.0: جوائز أكبر
            const p = prizes[Math.floor(Math.random()*prizes.length)];
            await addPoints(authorId, p, 'عجلة');
            return sendMessage(`🎡 العجلة وقفت على: ${p} نقطة!`);

        case 'start سؤال':
        case 'start مليون':
            const q = MILLION_Q[Math.floor(Math.random()*MILLION_Q.length)];
            await redis.hSet(singleKey, { type: 'سؤال', ans: q.a[q.c].toLowerCase(), tries: 1, reward: q.p });
            await redis.expire(singleKey, 60);
            return sendMessage(`❓ ${q.q} | ${q.a.join(' | ')} | +${q.p} نقطة`);

        case 'start كتابة':
            await redis.hSet(singleKey, { type: 'كتابة', ans: 'انفينيتي جين v3', tries: 1, reward: 50 });
            await redis.expire(singleKey, 60);
            return sendMessage(`⌨️ اكتب: "انفينيتي جين v3" | +50 +30 بونص`);

        case 'start كلمات':
            await redis.hSet(singleKey, { type: 'كلمات', ans: 'مبرمج', tries: 3, reward: 80 });
            await redis.expire(singleKey, 120);
            return sendMessage(`📝 رتب: ر م ب ج م | 3 محاولات | +80 نقطة`);

        case 'start كنز':
            const places = ['جبل','واد','غابة','كهف','صحراء','بحر']; // V3.0: 6 أماكن
            const ans = places[Math.floor(Math.random()*places.length)];
            await redis.hSet(singleKey, { type: 'كنز', ans, tries: 3, reward: 150 });
            await redis.expire(singleKey, 120);
            return sendMessage(`🗺️ ابحث عن الكنز: ${places.join(' | ')} | +150 نقطة`);

        case 'start سجن':
            await redis.hSet(singleKey, { type: 'سجن' });
            await redis.expire(singleKey, 60);
            return sendMessage(`⛓️ أنت في السجن! اكتب 'هروب' للمجازفة 60% نجاح`);

        case 'start سرعة':
            let a = Math.floor(Math.random()*20)+1; // V3.0: أرقام أكبر
            let b = Math.floor(Math.random()*10)+1;
            let c = Math.floor(Math.random()*5)+1;
            await redis.hSet(singleKey, { type: 'سرعة', ans: String(a+b*c), tries: 1, reward: 100 });
            await redis.expire(singleKey, 20); // V3.0: 20ث
            return sendMessage(`⚡ حل بسرعة: ${a} + ${b} * ${c} = ؟ | +100 +30 بونص`);

        case 'start قاتل': return createGame('قاتل', authorId, username);

        case 'start بورصة':
            await redis.hSet(singleKey, { type: 'بورصة' });
            await redis.expire(singleKey, 30);
            return sendMessage(`📈 هل السهم 'صعود' أم 'هبوط'؟ +250/-50`);

        case 'start مملكة':
            const k = await redis.get('kingdom:king');
            if(!k) {
                await redis.set('kingdom:king', authorId);
                await addPoints(authorId, 200, 'تتويج'); // V3.0: 200
                return sendMessage(`👑 ${username} أول ملك! +200 نقطة`);
            }
            const kingName = await redis.hGet(`user:${k}`, 'username');
            return sendMessage(`👑 الملك: ${kingName} | هجوم مملكة للانقلاب!`);

        case 'زهر':
            const z = Math.floor(Math.random()*6)+1;
            await addPoints(authorId, z*15, 'زهر'); // V3.0: x15
            return sendMessage(`🎲 رميت ${z} | +${z*15} نقطة!`);

        // V3.0: لعبتين جديدتين
        case 'start حظ':
            const luck = Math.random();
            if(luck > 0.7) {
                await addPoints(authorId, 300, 'حظ');
                return sendMessage(`🍀 محظوظ! +300 نقطة`);
            } else if(luck < 0.3) {
                await addPoints(authorId, -100, 'نحس');
                return sendMessage(`💀 نحس! -100 نقطة`);
            }
            return sendMessage(`😐 عادي | لا شيء`);

        case 'start تحدي':
            await redis.hSet(singleKey, { type: 'تحدي', ans: 'تقي', tries: 1, reward: 500 });
            await redis.expire(singleKey, 10); // V3.0: 10ث فقط
            return sendMessage(`🔥 تحدي السرعة! اكتب اسم البوت في 10ث | +500 نقطة`);
    }
};

// ================= Polling V3.0 =================
const pollChat = async () => {
    if (!liveChatId) return;
    try {
        const res = await youtube.liveChatMessages.list({
            liveChatId: liveChatId,
            part: 'snippet,authorDetails',
            pageToken: nextPageToken
        });
        nextPageToken = res.data.nextPageToken;
        for (const item of res.data.items) {
            await handleMessage(
                item.authorDetails.channelId,
                item.authorDetails.displayName,
                item.snippet.displayMessage
            );
        }
        setTimeout(pollChat, res.data.pollingIntervalMillis || 4000); // V3.0: أسرع
    } catch (e) {
        console.log('Poll Error V3:', e.message);
        if (e.message.includes('quotaExceeded')) {
            await sendMessage(`💀 الكوتا خلاصت | ${BOT_NAME} يرجع غدوة`);
        }
        setTimeout(pollChat, 15000);
    }
};

const startBot = async () => {
    await redis.connect();
    try {
        const res = await youtube.videos.list({
            part: 'liveStreamingDetails',
            id: process.env.YOUTUBE_VIDEO_ID
        });
        liveChatId = res.data.items[0]?.liveStreamingDetails?.activeLiveChatId;
        if (!liveChatId) throw new Error('لا يوجد بث مباشر');
        console.log(`${BOT_NAME} ${VERSION} متصل! LiveChatId: ${liveChatId}`);
        await sendMessage(`✨ ${BOT_NAME} ${VERSION} شغال | 18 لعبة + متجر نووي + ذكاء خارق | اكتب "سلام"`);
        pollChat();
    } catch (e) {
        console.log('فشل البدء V3:', e.message);
    }
};

startBot();

app.get('/', (req, res) => res.send(`INFINITY GEN ${VERSION} | 18 Games | قاالمة ♾️`));
app.get('/health', (req, res) => res.json({status: 'alive', version: VERSION}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server ${VERSION} running on ${PORT}`);
});
