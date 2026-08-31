import 'dotenv/config'
import express from 'express'

const token = process.env.TELEGRAM_BOT_TOKEN
const API_KEY = process.env.BOT_GATE_API_KEY
const BOT_PUBLIC_ID = process.env.BOT_PUBLIC_ID
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://princely-amazed-dragonfly.cloudpub.ru/webhook'

console.log('🤖 Запуск бота через BotGate Webhook...')

// Создаем Express приложение для вебхука
const app = express()
app.use(express.json())

// Логируем все входящие запросы для отладки
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`)
    console.log('Headers:', req.headers)
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2))
    }
    next()
})

// Функция для вызова BotGate API
async function callBotGate(method, params = {}) {
    if (!BOT_PUBLIC_ID) {
        throw new Error('BOT_PUBLIC_ID не установлен в .env')
    }
    if (!API_KEY) {
        throw new Error('BOT_GATE_API_KEY не установлен в .env')
    }
    
    const url = `https://bot-gate.ru/api/v1/bots/${BOT_PUBLIC_ID}/${method}`
    
    console.log(`📤 Вызов BotGate: ${method}`)
    console.log(`   URL: ${url}`)
    
    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(30000)
    }
    
    try {
        const response = await fetch(url, options)
        const data = await response.json()
        
        console.log(`   Ответ: ${response.status}`, data.ok ? '✅' : '❌')
        
        if (!data.ok) {
            throw new Error(data.description || 'Unknown error')
        }
        
        return data
    } catch (error) {
        console.error(`❌ Ошибка BotGate API (${method}):`, error.message)
        throw error
    }
}

// Функция для отправки сообщения через BotGate
async function sendMessage(chatId, text, options = {}) {
    return await callBotGate('sendMessage', {
        chat_id: chatId,
        text: text,
        parse_mode: options.parse_mode || 'HTML'
    })
}

// === ВАЖНО: Вебхук endpoint должен быть доступен по пути, который указан в WEBHOOK_URL ===
// Если WEBHOOK_URL = https://.../webhook, то слушаем /webhook
// Если WEBHOOK_URL = https://.../, то слушаем /

// Основной вебхук endpoint
app.post('/webhook', async (req, res) => {
    console.log('📩 Получен вебхук на /webhook')
    await handleWebhook(req, res)
})

// Также слушаем корневой путь (на случай, если CloudPub отправляет туда)
app.post('/', async (req, res) => {
    console.log('📩 Получен вебхук на /')
    await handleWebhook(req, res)
})

// Обработчик вебхука
async function handleWebhook(req, res) {
    try {
        const update = req.body
        
        // Проверяем подпись (опционально, но рекомендуется)
        const signature = req.headers['x-botgate-signature']
        console.log(`🔑 Signature: ${signature ? '✅ получена' : '❌ отсутствует'}`)
        
        console.log('📩 Получено обновление:', JSON.stringify(update, null, 2))
        
        // Обрабатываем сообщение
        if (update.message) {
            const msg = update.message
            const chatId = msg.chat.id
            const text = msg.text || ''
            
            console.log(`💬 Сообщение от ${chatId}: "${text}"`)
            
            // Обработка команды /start с кодом
            if (text.startsWith('/start ')) {
                const code = text.replace('/start ', '').trim()
                console.log(`🔑 Код привязки: ${code}`)
                
                try {
                    // Отправляем запрос на ваш сервер
                    const apiUrl = process.env.API_URL || 'http://localhost:3001'
                    console.log(`📡 Отправка на API: ${apiUrl}/api/telegram/webhook`)
                    
                    const response = await fetch(`${apiUrl}/api/telegram/webhook`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: {
                                text: `/start ${code}`,
                                chat: { 
                                    id: chatId, 
                                    username: msg.chat.username || msg.chat.first_name || ''
                                }
                            }
                        })
                    })
                    
                    const data = await response.json()
                    console.log(`📡 API ответ:`, data)
                    
                    if (!response.ok) {
                        await sendMessage(chatId, '❌ Не удалось привязать аккаунт. Попробуйте позже.')
                    }
                } catch (error) {
                    console.error('Ошибка привязки:', error)
                    await sendMessage(chatId, '❌ Ошибка соединения с сервером.')
                }
            }
            
            // Обычный /start
            if (text === '/start') {
                console.log('👋 Отправка приветствия...')
                await sendMessage(chatId,
                    '👋 Добро пожаловать в NoiteBot!\n\n' +
                    'Я помогаю получать нарезанные клипы прямо в Telegram.\n\n' +
                    'Чтобы привязать аккаунт:\n' +
                    '1. Зайдите в Noite → Экспорт → Привязать Telegram\n' +
                    '2. Скопируйте код\n' +
                    '3. Отправьте его мне командой /start КОД\n\n' +
                    'После привязки вы сможете отправлять клипы из панели экспорта прямо в этот чат.'
                )
                console.log('✅ Приветствие отправлено')
            }
        } else {
            console.log('⚠️ Получено обновление без message:', update)
        }
        
        // Отвечаем 200 OK, чтобы BotGate знал, что мы получили обновление
        res.status(200).json({ ok: true })
        
    } catch (error) {
        console.error('❌ Ошибка обработки вебхука:', error)
        res.status(500).json({ ok: false, error: error.message })
    }
}

// Получить информацию о вебхуке (для отладки)
app.get('/webhook-info', async (req, res) => {
    try {
        const info = await callBotGate('getWebhookInfo')
        res.json(info)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// Установить вебхук в BotGate
async function setWebhook() {
    try {
        console.log(`🔧 Установка вебхука: ${WEBHOOK_URL}`)
        
        const result = await callBotGate('setWebhook', {
            url: WEBHOOK_URL,
            secret_token: process.env.WEBHOOK_SECRET || 'noite_webhook_secret'
        })
        console.log('✅ Вебхук установлен:', result)
        
        // Проверяем, что вебхук действительно установлен
        const info = await callBotGate('getWebhookInfo')
        console.log('📡 Информация о вебхуке:', info)
        
    } catch (error) {
        console.error('❌ Ошибка установки вебхука:', error)
    }
}

// Health check для CloudPub
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        webhook: WEBHOOK_URL,
        time: new Date().toISOString()
    })
})

// Запускаем сервер
const PORT = process.env.BOT_PORT || 3000
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Бот запущен на порту ${PORT}`)
    console.log(`📡 Webhook URL: ${WEBHOOK_URL}`)
    console.log(`🌐 Health check: http://localhost:${PORT}/health`)
    console.log(`🔍 Webhook info: http://localhost:${PORT}/webhook-info`)
    
    // Устанавливаем вебхук при запуске
    await setWebhook()
})

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Остановка бота...')
    try {
        await callBotGate('deleteWebhook')
        console.log('✅ Вебхук удален')
    } catch (e) {
        console.error('Ошибка удаления вебхука:', e)
    }
    process.exit(0)
})