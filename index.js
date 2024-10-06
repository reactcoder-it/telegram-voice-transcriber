require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const axios = require('axios')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const path = require('path')
const OpenAI = require('openai')

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true
})

function convertOgaToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('wav')
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath)
  })
}

async function transcribeAudio(filePath) {
  const audioFile = fs.createReadStream(filePath)
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1'
  })
  return transcription.text
}

bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id
  const welcomeMessage = `Привет, ${msg.from.first_name}! 👋
Я бот для распознавания голосовых сообщений с помощью OpenAI Whisper.
Отправь мне голосовое сообщение, и я расшифрую его в текст.

Команды:
- /help - помощь по боту
- /start - начать работу
`
  bot.sendMessage(chatId, welcomeMessage)
})

bot.on('voice', async (msg) => {
  const chatId = msg.chat.id
  const voice = msg.voice
  const fileId = voice.file_id
  const fileUrl = await bot.getFileLink(fileId)

  const inputPath = path.resolve(__dirname, "input.oga")
  const outputPath = path.resolve(__dirname, "output.wav")

  const response = await axios({ url: fileUrl, responseType: 'stream' })
  const writer = fs.createWriteStream(inputPath)
  response.data.pipe(writer)

  writer.on('finish', async () => {
    try {
      await convertOgaToWav(inputPath, outputPath)
      const transcript = await transcribeAudio(outputPath)

      await bot.sendMessage(chatId, `Расшифровка: ${transcript}`)
      fs.unlink(inputPath, err => {
        if (err) console.error(`Ошибка при удалении ${inputPath}:`, err)
      })
      fs.unlink(outputPath, err => {
        if (err) console.error(`Ошибка при удалении ${outputPath}:`, err)
      })
    } catch (error) {
      console.error('Ошибка при обработке файла: ', error)
      await bot.sendMessage(chatId, 'Произошла ошибка при обработке голосового сообщения.')
    }
  })
})
