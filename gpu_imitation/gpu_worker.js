// gpu_worker.js — Сервер обработки видео на GPU сервере (оптимизированный)
import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Upload } from '@aws-sdk/lib-storage'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const execAsync = promisify(exec)

// ==================== КОНФИГ ====================

const PORT = process.env.GPU_WORKER_PORT || 3002
const TMP_DIR = path.join('/tmp', 'noite-worker')
const FONTS_DIR = path.join(__dirname, 'assets', 'fonts')

fs.mkdirSync(TMP_DIR, { recursive: true })
fs.mkdirSync(FONTS_DIR, { recursive: true })

// ==================== S3 КЛИЕНТ ====================

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'https://s3.ru1.storage.beget.cloud',
  region: 'ru-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
  forcePathStyle: true,
})

const S3_BUCKET = process.env.S3_BUCKET || '1fbd2026a312-syncue-mate'

// ==================== S3 УТИЛИТЫ ====================

async function uploadToS3(localPath, s3Key) {
  console.log(`📤 uploadToS3: ${localPath} -> ${s3Key}`)
  
  const fileSize = fs.statSync(localPath).size
  console.log(`   Размер: ${(fileSize / 1024 / 1024).toFixed(2)} MB`)
  
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: fs.createReadStream(localPath),
      ContentLength: fileSize,
      ContentType: 'video/mp4',
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  })
  
  upload.on('httpUploadProgress', (progress) => {
    if (progress.total) {
      const percent = Math.round((progress.loaded / progress.total) * 100)
      console.log(`   Прогресс: ${percent}%`)
    }
  })
  
  await upload.done()
  return s3Key
}

async function deleteLocalFile(localPath) {
  try {
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath)
  } catch (_) {}
}

// ==================== ОПТИМИЗИРОВАННОЕ СКАЧИВАНИЕ ====================

/**
 * Получает размер файла в S3
 */
async function getS3FileSize(s3Key) {
  const command = new HeadObjectCommand({ Bucket: S3_BUCKET, Key: s3Key })
  const response = await s3Client.send(command)
  return response.ContentLength || 0
}

/**
 * Генерирует подписанный URL для S3
 */
async function getSignedS3Url(s3Key, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key })
  return getSignedUrl(s3Client, command, { expiresIn })
}

/**
 * Скачивает ТОЛЬКО нужный фрагмент видео из S3
 * Использует Range-запрос для экономии трафика и времени
 */
async function downloadVideoFragment(s3Key, startTime, endTime, localPath) {
  console.log(`📥 Скачивание фрагмента [${startTime}s - ${endTime}s] из S3`)
  
  // Получаем подписанный URL
  const signedUrl = await getSignedS3Url(s3Key, 3600)
  
  // Используем FFmpeg для скачивания только нужного фрагмента
  // FFmpeg сам делает Range-запросы
  const duration = endTime - startTime
  const cmd = `ffmpeg -ss ${startTime} -i "${signedUrl}" -t ${duration} -c copy -avoid_negative_ts make_zero -y "${localPath}"`
  
  console.log(`   FFmpeg: ${cmd.substring(0, 100)}...`)
  await execAsync(cmd)
  
  console.log(`✅ Фрагмент скачан: ${(fs.statSync(localPath).size / 1024 / 1024).toFixed(2)} MB`)
  return localPath
}

/**
 * Скачивает полное видео (для mashup с несколькими фрагментами)
 */
async function downloadFullVideo(s3Key, localPath) {
  console.log(`📥 Скачивание полного видео из S3`)
  
  const signedUrl = await getSignedS3Url(s3Key, 3600)
  const cmd = `ffmpeg -i "${signedUrl}" -c copy -y "${localPath}"`
  
  await execAsync(cmd)
  console.log(`✅ Видео скачано: ${(fs.statSync(localPath).size / 1024 / 1024).toFixed(2)} MB`)
  return localPath
}

// ==================== НАСТРОЙКИ КАЧЕСТВА ====================

function getQualitySettings(q) {
  switch (q) {
    case '720p': return { scale: 720, crf: 26, bitrate: '2M' }
    case '1080p': return { scale: 1080, crf: 23, bitrate: '4M' }
    default: return { scale: 1920, crf: 18, bitrate: '12M' }
  }
}

function getTargetCanvas(quality, vert) {
  const q = getQualitySettings(quality)
  if (vert) {
    const height = q.scale
    const width = Math.max(2, Math.round((height * 9 / 16) / 2) * 2)
    return { width, height }
  } else {
    const height = q.scale
    const width = Math.max(2, Math.round((height * 16 / 9) / 2) * 2)
    return { width, height }
  }
}

// ==================== ШРИФТЫ ====================

const FONT_PATH = path.join(FONTS_DIR, 'Roboto-Regular.ttf')
const hasFont = fs.existsSync(FONT_PATH)

function getWatermarkFilter() {
  if (!hasFont) return ''
  const safePath = FONT_PATH.replace(/\\/g, '/').replace(/:/g, '\\:')
  return `drawtext=fontfile='${safePath}':text='Noite':fontsize=24:fontcolor=white@0.4:x=w-tw-20:y=h-th-20`
}

// ==================== СУБТИТРЫ ====================

const DEFAULT_SUBTITLE_STYLE = {
  fontSize: 26,
  fontColor: '#FFFFFF',
  highlightColor: '#22C55E',
  outlineColor: '#000000',
  outlineWidth: 2,
  backgroundOpacity: 0,
  xPercent: 50,
  yPercent: 80,
  bold: true,
  fontFamily: 'Montserrat Black',
  wordsPerGroup: 3,
}

function hexToAssColor(hex, opacityPercent = 100) {
  const clean = (hex || '#FFFFFF').replace('#', '')
  const r = clean.substring(0, 2) || 'FF'
  const g = clean.substring(2, 4) || 'FF'
  const b = clean.substring(4, 6) || 'FF'
  const alpha = Math.round((100 - Math.min(100, Math.max(0, opacityPercent))) / 100 * 255)
  const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase()
  return `&H${alphaHex}${b}${g}${r}`.toUpperCase()
}

function formatAssTime(seconds) {
  const total = Math.max(0, seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  const cs = Math.round((total - Math.floor(total)) * 100)
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
}

function escapeAssText(text) {
  return (text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\N')
    .trim()
}

function clipWordsToRange(words, start, end) {
  return words
    .filter(w => w.end > start && w.start < end)
    .map(w => ({ start: Math.max(0, w.start - start), end: Math.min(end - start, w.end - start), word: (w.word || '').trim() }))
    .filter(w => w.end > w.start && w.word.length > 0)
}

function groupWordsForKaraoke(words, groupSize) {
  const groups = []
  let current = []
  for (const w of words) {
    if (current.length === 0) { current.push(w); continue }
    const prev = current[current.length - 1]
    const gap = w.start - prev.end
    if (gap > 0.3 || current.length >= groupSize) {
      groups.push(current)
      current = [w]
    } else {
      current.push(w)
    }
  }
  if (current.length > 0) groups.push(current)
  return groups
}

function buildWordGroupsContinuous(words, clipStart, clipEnd, groupSize) {
  return groupWordsForKaraoke(clipWordsToRange(words, clipStart, clipEnd), groupSize)
}

function buildWordGroupsMashup(words, fragments, groupSize) {
  let offset = 0
  let allGroups = []
  for (const frag of fragments) {
    const fragDuration = frag.end - frag.start
    const fragWords = clipWordsToRange(words, frag.start, frag.end)
      .map(w => ({ ...w, start: w.start + offset, end: w.end + offset }))
    allGroups = allGroups.concat(groupWordsForKaraoke(fragWords, groupSize))
    offset += fragDuration
  }
  return allGroups
}

function hexToAssInline(hex) {
  const clean = (hex || '#FFFFFF').replace('#', '')
  const r = clean.substring(0, 2) || 'FF'
  const g = clean.substring(2, 4) || 'FF'
  const b = clean.substring(4, 6) || 'FF'
  return `&H${b}${g}${r}&`.toUpperCase()
}

function buildKaraokeDialogueLines(groups, style) {
  const baseTag = hexToAssInline(style.fontColor)
  const highlightTag = hexToAssInline(style.highlightColor)
  const lines = []
  const MIN_DUR = 0.1

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]
    const nextGroup = groups[g + 1]

    for (let i = 0; i < group.length; i++) {
      const word = group[i]
      if (word.end <= word.start) continue

      const start = word.start
      let end

      if (i < group.length - 1) {
        end = group[i + 1].start
      } else {
        if (nextGroup && nextGroup.length > 0) {
          end = nextGroup[0].start
        } else {
          end = word.end
        }
      }

      if (end - start < MIN_DUR) end = start + MIN_DUR

      const text = group.map((w, j) => {
        const escaped = escapeAssText(style.upperCase ? w.word.toUpperCase() : w.word)
        return j === i
          ? `{\\c${highlightTag}}${escaped}{\\c${baseTag}}`
          : escaped
      }).join(' ')

      lines.push({ start, end, text })
    }
  }

  return lines
}

function buildKaraokeAssContent(dialogueLines, style, playResX, playResY) {
  const primaryColor = hexToAssColor(style.fontColor, 100)
  const outlineColor = hexToAssColor(style.outlineColor, 100)
  const backColor = style.backgroundOpacity > 0 ? hexToAssColor('#000000', style.backgroundOpacity) : '&H00000000'
  const borderStyle = style.backgroundOpacity > 0 ? 3 : 1
  const bold = style.bold ? -1 : 0
  const posX = Math.round((Math.min(100, Math.max(0, style.xPercent)) / 100) * playResX)
  const posY = Math.round((Math.min(100, Math.max(0, style.yPercent)) / 100) * playResY)

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily},${style.fontSize},${primaryColor},${primaryColor},${outlineColor},${backColor},${bold},0,0,0,100,100,0,0,${borderStyle},${style.outlineWidth},0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
  const posTag = `{\\an5\\pos(${posX},${posY})}`
  const lines = dialogueLines
    .map(ev => `Dialogue: 0,${formatAssTime(ev.start)},${formatAssTime(ev.end)},Default,,0,0,0,,${posTag}${ev.text}`)
    .join('\n')
  return header + lines + '\n'
}

function buildSubtitleFilterAndFile(wordGroups, styleOptions, vertical, tempDir) {
  if (!wordGroups || wordGroups.length === 0) return null
  const style = { ...DEFAULT_SUBTITLE_STYLE, ...styleOptions }
  const playResX = vertical ? 1080 : 1920
  const playResY = vertical ? 1920 : 1080
  const dialogueLines = buildKaraokeDialogueLines(wordGroups, style)
  if (dialogueLines.length === 0) return null
  const assContent = buildKaraokeAssContent(dialogueLines, style, playResX, playResY)
  const assPath = path.join(tempDir, `sub_${uuidv4()}.ass`)
  fs.writeFileSync(assPath, assContent, 'utf-8')
  const safePath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')
  let filter = `subtitles='${safePath}'`
  const hasFonts = fs.existsSync(FONTS_DIR) && fs.readdirSync(FONTS_DIR).some(f => f.toLowerCase().endsWith('.ttf'))
  if (hasFonts) {
    const safeFontsDir = FONTS_DIR.replace(/\\/g, '/').replace(/:/g, '\\:')
    filter += `:fontsdir='${safeFontsDir}'`
  }
  return { filter, assPath }
}

// ==================== ОВЕРЛЕИ ====================

function splitTextToFit(text, maxWidthPx, fontSizePx) {
  const charWidth = fontSizePx * 0.75
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidthPx / charWidth))
  
  const words = text.split(/\s+/)
  const lines = []
  let currentLine = ''
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine
    } else {
      if (currentLine) lines.push(currentLine)
      currentLine = word
    }
  }
  
  if (currentLine) lines.push(currentLine)
  return lines.join('\n')
}

function buildTextOverlayFilter(overlay, playResX, playResY, clipDuration) {
  if (!overlay.text) return null
  
  const style = {
    fontSize: 32,
    fontColor: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 0,
    backgroundOpacity: 0,
    bold: true,
    fontFamily: 'Roboto',
    ...(overlay.textStyle || {})
  }
  
  const fontSizePx = Math.max(8, Math.round(style.fontSize * playResY / 1920))
  const centerX = Math.round((overlay.xPercent / 100) * playResX)
  const centerY = Math.round((overlay.yPercent / 100) * playResY)
  
  const wrappedText = splitTextToFit(overlay.text, Math.round((overlay.widthPercent / 100) * playResX), fontSizePx)
  const lines = wrappedText.split('\n')
  
  const fontColor = (style.fontColor || '#FFFFFF').replace('#', '')
  const outlineColor = (style.outlineColor || '#000000').replace('#', '')
  
  const startT = overlay.startTime ?? 0
  const endT = overlay.endTime ?? clipDuration
  
  const fontFamily = style.fontFamily || 'Roboto'
  const fontPath = path.join(FONTS_DIR, `${fontFamily}.ttf`)
  let fontFilePart = ''
  if (fs.existsSync(fontPath)) {
    fontFilePart = `:fontfile='${fontPath.replace(/\\/g, '/').replace(/:/g, '\\:')}'`
  } else if (hasFont) {
    fontFilePart = `:fontfile='${FONT_PATH.replace(/\\/g, '/').replace(/:/g, '\\:')}'`
  }
  
  const lineHeight = Math.round(fontSizePx * 1.3)
  const totalHeight = lines.length * lineHeight
  const startY = centerY - totalHeight / 2
  
  const drawtexts = lines.map((line, i) => {
    const escapedLine = line.replace(/\\/g, '\\\\').replace(/:/g, '\\:')
    const y = startY + i * lineHeight
    
    let filter = `drawtext=text='${escapedLine}'`
    filter += `:fontsize=${fontSizePx}`
    filter += `:fontcolor=0x${fontColor}@${overlay.opacity ?? 1}`
    filter += `:x=${centerX}-text_w/2:y=${y}`
    
    if (style.outlineWidth > 0) {
      filter += `:borderw=${Math.round(style.outlineWidth)}:bordercolor=0x${outlineColor}@1`
    }
    
    if (style.backgroundOpacity > 0) {
      filter += `:box=1:boxcolor=black@${style.backgroundOpacity / 100}:boxborderw=8`
    }
    
    filter += fontFilePart
    filter += `:enable='between(t\\,${startT}\\,${endT})'`
    return filter
  })
  
  return drawtexts.join(',')
}

function buildImageOverlayChain(overlay, index, playResX, playResY, clipDuration) {
  const w = Math.max(2, Math.round((overlay.widthPercent / 100) * playResX))
  const h = Math.max(2, Math.round((overlay.heightPercent / 100) * playResY))
  const centerX = Math.round((overlay.xPercent / 100) * playResX)
  const centerY = Math.round((overlay.yPercent / 100) * playResY)
  const safePath = overlay.filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
  const label = `ov${index}`
  let chain = `movie='${safePath}',scale=${w}:${h}`
  const rotDeg = overlay.rotation || 0
  if (rotDeg !== 0) {
    const rad = (rotDeg * Math.PI / 180).toFixed(6)
    chain += `,format=rgba,rotate=${rad}:c=black@0:ow=rotw(${rad}):oh=roth(${rad})`
  }
  if ((overlay.opacity ?? 1) < 1) {
    chain += `,format=rgba,colorchannelmixer=aa=${overlay.opacity}`
  }
  const startT = overlay.startTime ?? 0
  const endT = overlay.endTime ?? clipDuration
  return {
    label,
    chain,
    x: `${centerX}-overlay_w/2`,
    y: `${centerY}-overlay_h/2`,
    enableExpr: `between(t\\,${startT}\\,${endT})`
  }
}

// ==================== КОМПОЗИЦИЯ ====================

function buildCompositionParts(canvas, layoutRegions, panX, panY, videoZoom, vert) {
  const zoom = videoZoom || 1

  if (layoutRegions && layoutRegions.length > 0) {
    const parts = []
    let current = '1:v'
    const zoomedLabel = 'zoomed'

    if (zoom >= 1) {
      if (vert) {
        const baseW = 'min(iw\\,ih*9/16)'
        const baseH = 'min(ih\\,iw*16/9)'
        const cropW = `(${baseW})/${zoom}`
        const cropH = `(${baseH})/${zoom}`
        const cropX = `(iw-${baseW})/2 + (${baseW}*(1-1/${zoom})/2) - ${panX}`
        const cropY = `(ih-${baseH})/2 + (${baseH}*(1-1/${zoom})/2) - ${panY}`
        parts.push(`[0:v]crop=${cropW}:${cropH}:${cropX}:${cropY}[${zoomedLabel}]`)
      } else {
        const baseW = 'min(iw\\,ih*16/9)'
        const baseH = 'min(ih\\,iw*9/16)'
        const cropW = `(${baseW})/${zoom}`
        const cropH = `(${baseH})/${zoom}`
        const cropX = `(iw-${baseW})/2 + (${baseW}*(1-1/${zoom})/2) - ${panX}`
        const cropY = `(ih-${baseH})/2 + (${baseH}*(1-1/${zoom})/2) - ${panY}`
        parts.push(`[0:v]crop=${cropW}:${cropH}:${cropX}:${cropY}[${zoomedLabel}]`)
      }
    } else {
      if (vert) {
        const scaleW = Math.max(2, Math.round(canvas.width * zoom))
        const scaleH = Math.max(2, Math.round(canvas.height * zoom))
        parts.push(`[0:v]scale=${scaleW}:${scaleH},pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:black[${zoomedLabel}]`)
      } else {
        const scaleW = Math.max(2, Math.round(canvas.width * zoom))
        const scaleH = Math.max(2, Math.round(canvas.height * zoom))
        parts.push(`[0:v]scale=${scaleW}:${scaleH},pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:black[${zoomedLabel}]`)
      }
    }

    layoutRegions.forEach((r, i) => {
      const cropW = `iw*${(r.srcWPercent / 100).toFixed(6)}`
      const cropH = `ih*${(r.srcHPercent / 100).toFixed(6)}`
      const cropX = `iw*${(r.srcXPercent / 100).toFixed(6)}`
      const cropY = `ih*${(r.srcYPercent / 100).toFixed(6)}`

      const dstW = Math.max(2, Math.round(canvas.width * r.dstWPercent / 100))
      const dstH = Math.max(2, Math.round(canvas.height * r.dstHPercent / 100))
      const dstX = Math.round(canvas.width * r.dstXPercent / 100)
      const dstY = Math.round(canvas.height * r.dstYPercent / 100)

      const regLabel = `reg${i}`
      parts.push(`[${zoomedLabel}]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${dstW}:${dstH}[${regLabel}]`)
      const nextLabel = `lay${i}`
      parts.push(`[${current}][${regLabel}]overlay=${dstX}:${dstY}[${nextLabel}]`)
      current = nextLabel
    })

    return { parts, outputLabel: current, needsColorInput: true }
  }

  if (zoom >= 1) {
    let cropExpr
    if (vert) {
      const baseW = 'min(iw\\,ih*9/16)'
      const baseH = 'min(ih\\,iw*16/9)'
      const cropW = `(${baseW})/${zoom}`
      const cropH = `(${baseH})/${zoom}`
      const cropX = `(iw-${baseW})/2 + (${baseW}*(1-1/${zoom})/2) - ${panX}`
      const cropY = `(ih-${baseH})/2 + (${baseH}*(1-1/${zoom})/2) - ${panY}`
      cropExpr = `crop=${cropW}:${cropH}:${cropX}:${cropY}`
    } else {
      const baseW = 'min(iw\\,ih*16/9)'
      const baseH = 'min(ih\\,iw*9/16)'
      const cropW = `(${baseW})/${zoom}`
      const cropH = `(${baseH})/${zoom}`
      const cropX = `(iw-${baseW})/2 + (${baseW}*(1-1/${zoom})/2) - ${panX}`
      const cropY = `(ih-${baseH})/2 + (${baseH}*(1-1/${zoom})/2) - ${panY}`
      cropExpr = `crop=${cropW}:${cropH}:${cropX}:${cropY}`
    }

    const parts = [`[0:v]${cropExpr},scale=${canvas.width}:${canvas.height}[base]`]
    return { parts, outputLabel: 'base', needsColorInput: false }
  } else {
    let filterChain
    if (vert) {
      const cropFilter = `crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9):(iw-min(iw\\,ih*9/16))/2 - ${panX}:(ih-min(ih\\,iw*16/9))/2 - ${panY}`
      const scaleW = Math.max(2, Math.round(canvas.width * zoom))
      const scaleH = Math.max(2, Math.round(canvas.height * zoom))
      filterChain = `${cropFilter},scale=${scaleW}:${scaleH},pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:black`
    } else {
      const cropFilter = `crop=min(iw\\,ih*16/9):min(ih\\,iw*9/16):(iw-min(iw\\,ih*16/9))/2 - ${panX}:(ih-min(ih\\,iw*9/16))/2 - ${panY}`
      const scaleW = Math.max(2, Math.round(canvas.width * zoom))
      const scaleH = Math.max(2, Math.round(canvas.height * zoom))
      filterChain = `${cropFilter},scale=${scaleW}:${scaleH},pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:black`
    }

    const parts = [`[0:v]${filterChain}[scaled]`]
    return { parts, outputLabel: 'scaled', needsColorInput: false }
  }
}

function buildFullFilterGraph({ canvas, layoutRegions, panX, panY, videoZoom, vert, subtitleFilter, watermark, overlays, clipDuration }) {
  const comp = buildCompositionParts(canvas, layoutRegions, panX, panY, videoZoom, vert)
  const parts = [...comp.parts]
  let current = comp.outputLabel

  if (watermark && hasFont) {
    const nextLabel = 'wm'
    parts.push(`[${current}]${getWatermarkFilter()}[${nextLabel}]`)
    current = nextLabel
  }

  if (subtitleFilter) {
    const nextLabel = 'sub'
    parts.push(`[${current}]${subtitleFilter}[${nextLabel}]`)
    current = nextLabel
  }

  const imageOverlays = (overlays || [])
    .filter(o => o.type === 'image' && o.filePath)
    .sort((a, b) => a.zIndex - b.zIndex)

  imageOverlays.forEach((ov, i) => {
    const { label, chain, x, y, enableExpr } = buildImageOverlayChain(ov, i, canvas.width, canvas.height, clipDuration)
    parts.push(`${chain}[${label}]`)
    const nextLabel = `lov${i}`
    parts.push(`[${current}][${label}]overlay=${x}:${y}:enable='${enableExpr}'[${nextLabel}]`)
    current = nextLabel
  })

  const textOverlays = (overlays || [])
    .filter(o => o.type === 'text' && o.text)
    .sort((a, b) => a.zIndex - b.zIndex)

  const textFilters = textOverlays
    .map(o => buildTextOverlayFilter(o, canvas.width, canvas.height, clipDuration))
    .filter(Boolean)

  if (textFilters.length > 0) {
    const nextLabel = 'vout'
    parts.push(`[${current}]${textFilters.join(',')}[${nextLabel}]`)
    current = nextLabel
  }

  return {
    filterComplex: parts.join(';'),
    outputLabel: current,
    needsColorInput: comp.needsColorInput
  }
}

// ==================== ЭКСПОРТ ====================

async function exportContinuousClip(src, start, end, out, format, wm, quality, vert, subtitleFilter, panX = 0, panY = 0, overlays = [], videoZoom = 1, layoutRegions = []) {
  const q = getQualitySettings(quality)
  const canvas = getTargetCanvas(quality, vert)
  const clipDuration = end - start
  const graph = buildFullFilterGraph({ canvas, layoutRegions, panX, panY, videoZoom, vert, subtitleFilter, watermark: wm, overlays, clipDuration })
  const codecArgs = `-c:v ${format === 'webm' ? 'libvpx-vp9' : 'libx264'} -preset fast -crf ${q.crf} ${format === 'webm' ? `-b:v ${q.bitrate}` : ''} -c:a ${format === 'webm' ? 'libopus' : 'aac'} -b:a 128k`
  const colorInput = graph.needsColorInput ? ` -f lavfi -i color=c=black:s=${canvas.width}x${canvas.height}` : ''
  const shortest = graph.needsColorInput ? '-shortest' : ''

  const cmd = `ffmpeg -i "${src}"${colorInput} -filter_complex "${graph.filterComplex}" -map "[${graph.outputLabel}]" -map 0:a? ${shortest} ${codecArgs} -y "${out}"`
  await execAsync(cmd)
}

async function exportMashup(src, fragments, out, format, wm, quality, vert, subtitleFilter, panX = 0, panY = 0, overlays = [], videoZoom = 1, layoutRegions = []) {
  const tempDir = path.join(TMP_DIR, `mashup_${uuidv4()}`)
  fs.mkdirSync(tempDir, { recursive: true })
  const files = []

  for (let i = 0; i < fragments.length; i++) {
    const fp = path.join(tempDir, `frag_${i}.mp4`)
    files.push(fp)
    const fragDuration = fragments[i].end - fragments[i].start
    await execAsync(
      `ffmpeg -ss ${fragments[i].start} -i "${src}" -t ${fragDuration} -c:v libx264 -preset ultrafast -crf 18 -c:a aac -b:a 128k -avoid_negative_ts make_zero -y "${fp}"`
    )
  }

  const listPath = path.join(tempDir, 'list.txt')
  fs.writeFileSync(listPath, files.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'))

  const q = getQualitySettings(quality)
  const canvas = getTargetCanvas(quality, vert)
  const clipDuration = fragments.reduce((s, f) => s + (f.end - f.start), 0)
  const graph = buildFullFilterGraph({ canvas, layoutRegions, panX, panY, videoZoom, vert, subtitleFilter, watermark: wm, overlays, clipDuration })
  const codecArgs = `-c:v ${format === 'webm' ? 'libvpx-vp9' : 'libx264'} -preset fast -crf ${q.crf} ${format === 'webm' ? `-b:v ${q.bitrate}` : ''} -c:a ${format === 'webm' ? 'libopus' : 'aac'} -b:a 128k`
  const colorInput = graph.needsColorInput ? ` -f lavfi -i color=c=black:s=${canvas.width}x${canvas.height}` : ''
  const shortest = graph.needsColorInput ? '-shortest' : ''

  const cmd = `ffmpeg -f concat -safe 0 -i "${listPath}"${colorInput} -filter_complex "${graph.filterComplex}" -map "[${graph.outputLabel}]" -map 0:a? ${shortest} ${codecArgs} -y "${out}"`
  await execAsync(cmd)
  fs.rmSync(tempDir, { recursive: true })
}

// ==================== EXPRESS ====================

const app = express()
app.use(express.json({ limit: '50mb' }))

// ==================== ЭНДПОИНТЫ ====================

app.post('/export', async (req, res) => {
  const taskId = uuidv4()
  const {
    userId,
    sourceS3Key,
    start: originalStart,
    end: originalEnd,
    format = 'mp4',
    quality = '1080p',
    vertical = true,
    watermark = false,
    subtitleSettings = null,
    words = null,
    fragments = null,
    overlays = [],
    videoZoom = 1,
    layoutRegions = [],
    isPreview = false,
    returnFile = false,  // ← НОВЫЙ ПАРАМЕТР: если true, возвращаем файл напрямую
  } = req.body

  console.log(`🎬 Начало ${isPreview ? 'предпросмотра' : 'экспорта'} ${taskId}`)
  console.log(`   Return file: ${returnFile}`)

  try {
    let localSource
    let effectiveStart = originalStart || 0
    let effectiveEnd = originalEnd || 0
    let effectiveFragments = null

    if (fragments && fragments.length > 0) {
      const minStart = Math.min(...fragments.map(f => f.start))
      const maxEnd = Math.max(...fragments.map(f => f.end))
      
      console.log(`📥 Mashup: скачивание [${minStart}s - ${maxEnd}s]`)
      
      localSource = path.join(TMP_DIR, `${taskId}_range.mp4`)
      await downloadVideoFragment(sourceS3Key, minStart, maxEnd, localSource)
      
      effectiveFragments = fragments.map(f => ({
        ...f,
        start: f.start - minStart,
        end: f.end - minStart,
      }))
      
    } else {
      localSource = path.join(TMP_DIR, `${taskId}_fragment.mp4`)
      await downloadVideoFragment(sourceS3Key, effectiveStart, effectiveEnd, localSource)
      
      effectiveEnd = effectiveEnd - effectiveStart
      effectiveStart = 0
    }

    // Скачиваем оверлеи
    const localOverlays = []
    for (let i = 0; i < (overlays || []).length; i++) {
      const ov = overlays[i]
      if (ov.filePath && ov.filePath.startsWith('s3://')) {
        const s3Key = ov.filePath.replace('s3://', '')
        const localPath = path.join(TMP_DIR, `${taskId}_overlay_${i}.png`)
        const signedUrl = await getSignedS3Url(s3Key, 3600)
        await execAsync(`ffmpeg -i "${signedUrl}" -y "${localPath}"`)
        localOverlays.push({ ...ov, filePath: localPath })
      } else if (ov.filePath && fs.existsSync(ov.filePath)) {
        localOverlays.push(ov)
      }
    }

    // Субтитры
    let subtitleFilter = null
    if (subtitleSettings && subtitleSettings.enabled && words && words.length > 0) {
      if (fragments && fragments.length > 0) {
        const originalFragments = fragments
        const groups = buildWordGroupsMashup(words, originalFragments, subtitleSettings.wordsPerGroup || 3)
        const subInfo = buildSubtitleFilterAndFile(groups, subtitleSettings, vertical, TMP_DIR)
        if (subInfo) subtitleFilter = subInfo.filter
      } else {
        const groups = buildWordGroupsContinuous(words, originalStart, originalEnd, subtitleSettings.wordsPerGroup || 3)
        const subInfo = buildSubtitleFilterAndFile(groups, subtitleSettings, vertical, TMP_DIR)
        if (subInfo) subtitleFilter = subInfo.filter
      }
    }

    const outputPath = path.join(TMP_DIR, `${taskId}_export.${format}`)

    if (effectiveFragments && effectiveFragments.length > 0) {
      await exportMashup(
        localSource,
        effectiveFragments,
        outputPath,
        format,
        watermark,
        isPreview ? '720p' : quality,
        vertical,
        subtitleFilter,
        0, 0,
        localOverlays,
        videoZoom,
        layoutRegions
      )
    } else {
      await exportContinuousClip(
        localSource,
        effectiveStart,
        effectiveEnd,
        outputPath,
        format,
        watermark,
        isPreview ? '720p' : quality,
        vertical,
        subtitleFilter,
        0, 0,
        localOverlays,
        videoZoom,
        layoutRegions
      )
    }

    console.log(`✅ Файл создан: ${outputPath}`)

    if (returnFile) {
      console.log('📤 Отправка файла напрямую...')
      
      // Проверяем, что файл существует и не пустой
      if (!fs.existsSync(outputPath)) {
        console.error('❌ Файл не существует:', outputPath)
        return res.status(500).json({ error: 'Файл не создан' })
      }
      
      const fileSize = fs.statSync(outputPath).size
      console.log(`   Размер файла: ${(fileSize / 1024 / 1024).toFixed(2)} MB`)
      
      if (fileSize === 0) {
        console.error('❌ Файл пустой')
        return res.status(500).json({ error: 'Файл пустой' })
      }
      
      // Проверяем через ffprobe
      try {
        const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration,size -of json "${outputPath}"`)
        console.log('📦 Информация о файле:', stdout)
      } catch (ffprobeError) {
        console.warn('⚠️ ffprobe не смог прочитать файл:', ffprobeError.message)
      }
      
      res.setHeader('Content-Type', format === 'webm' ? 'video/webm' : format === 'mov' ? 'video/quicktime' : 'video/mp4')
      res.setHeader('Content-Disposition', `attachment; filename="noite_${taskId}.${format}"`)
      res.setHeader('Content-Length', fileSize)
      
      // Стримим файл
      const fileStream = fs.createReadStream(outputPath)
      fileStream.pipe(res)
      
      fileStream.on('end', () => {
        // Очистка после отправки
        setTimeout(() => {
          deleteLocalFile(localSource)
          deleteLocalFile(outputPath)
          for (const ov of localOverlays) deleteLocalFile(ov.filePath)
        }, 5000)
      })
      
      fileStream.on('error', (err) => {
        console.error('Ошибка стриминга:', err)
        res.end()
      })
      
      return // ← ВАЖНО: не продолжаем выполнение
    }

    // ===== ОБЫЧНЫЙ РЕЖИМ: загружаем в S3 =====
    const resultS3Key = `${userId}/${isPreview ? 'previews' : 'exports'}/${taskId}.${format}`
    console.log(`📤 Загрузка в S3: ${resultS3Key}`)
    await uploadToS3(outputPath, resultS3Key)

    res.json({ s3Key: resultS3Key })

    // Очистка
    setTimeout(() => {
      deleteLocalFile(localSource)
      deleteLocalFile(outputPath)
      for (const ov of localOverlays) deleteLocalFile(ov.filePath)
    }, 10000)

  } catch (e) {
    console.error(`❌ Ошибка ${taskId}:`, e)
    res.status(500).json({ error: e.message })
  }
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`🚀 GPU Worker запущен на http://localhost:${PORT}`)
})