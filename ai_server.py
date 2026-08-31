import os
import sys

# Находим путь к библиотекам NVIDIA внутри вашего окружения Python
site_packages = os.path.join(os.path.dirname(sys.executable), 'Lib', 'site-packages')
nvidia_base = os.path.join(site_packages, 'nvidia')

if os.path.exists(nvidia_base):
    for folder in ['cublas', 'cudnn', 'cuda_runtime']:
        bin_path = os.path.join(nvidia_base, folder, 'bin')
        if os.path.exists(bin_path):
            os.environ["PATH"] = bin_path + os.pathsep + os.environ["PATH"]
            if hasattr(os, 'add_dll_directory'):
                os.add_dll_directory(bin_path)

import json
import torch
import gc
import requests
from PIL import Image
from flask import Flask, request, jsonify
from pyannote.audio import Pipeline

app = Flask(__name__)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
HF_TOKEN = "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"

# Глобальные переменные
whisper_model = None
align_model = None
align_metadata = None
clip_model = None
clip_processor = None
diarize_model = None

CATEGORIES = [
    "talking head", "gaming gameplay", "screencast", "outdoor scene",
    "indoor scene", "text on screen", "action movement", 
    "multiple people group", "closeup face", "dark scene",
    "bright scene", "presentation slides"
]

MOODS = [
    "calm peaceful", "intense exciting", "funny humorous",
    "serious dramatic", "emotional", "neutral"
]

def clear_gpu():
    """Выгружает все модели и чистит кэш CUDA"""
    global whisper_model, align_model, align_metadata, clip_model, clip_processor, diarize_model
    whisper_model = None
    align_model = None
    align_metadata = None
    clip_model = None
    clip_processor = None
    diarize_model = None  # ← ДОБАВЬТЕ ЭТО
    gc.collect()
    torch.cuda.empty_cache()
    print("🧹 GPU память очищена")

def get_diarization():
    global diarize_model
    if diarize_model is None:
        print("Загрузка Diarization (Pyannote)...")
        diarize_model = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            token=HF_TOKEN
        )
        # Перемещаем на GPU
        if DEVICE == "cuda":
            import torch
            diarize_model = diarize_model.to(torch.device("cuda"))
    return diarize_model

def get_whisper():
    global whisper_model, align_model, align_metadata
    if whisper_model is None:
        print("Загрузка WhisperX...")
        import whisperx
        whisper_model = whisperx.load_model("medium", DEVICE, compute_type=COMPUTE_TYPE)
        align_model, align_metadata = whisperx.load_align_model(language_code="ru", device=DEVICE)
    return whisper_model, align_model, align_metadata

def get_clip():
    global clip_model, clip_processor
    if clip_model is None:
        print("Загрузка CLIP...")
        from transformers import CLIPProcessor, CLIPModel
        clip_model = CLIPModel.from_pretrained("openai/clip-vit-large-patch14").to(DEVICE)
        clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")
    return clip_model, clip_processor

@app.route('/transcribe', methods=['POST'])
def transcribe():
    # Принудительно создаем папку tmp, если её нет
    os.makedirs('./tmp', exist_ok=True)
    audio_path = './tmp/audio.mp3'

    # Проверяем источник файла: прямая загрузка или ссылка S3
    if 'audio' in request.files:
        audio_file = request.files['audio']
        audio_file.save(audio_path)
    elif 'audioUrl' in request.form:
        audio_url = request.form.get('audioUrl')
        try:
            print(f"📥 Скачивание аудио для транскрибации по S3-ссылке...")
            # Скачиваем файл чанками, чтобы не забивать ОЗУ сервера
            with requests.get(audio_url, stream=True) as r:
                r.raise_for_status()
                with open(audio_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
            print(f"✅ Файл успешно скачан. Размер: {os.path.getsize(audio_path)} байт")
        except Exception as e:
            print(f"❌ Ошибка скачивания из S3 в /transcribe: {str(e)}")
            return jsonify({"error": f"Failed to download audio from S3: {str(e)}"}), 500
    else:
        return jsonify({"error": "No audio file or audioUrl provided"}), 400

    language = request.form.get('language', 'ru')

    try:
        import whisperx
        
        if clip_model is not None:
            clear_gpu()
        
        model, align_m, align_meta = get_whisper()
        audio = whisperx.load_audio(audio_path)
        
        # Транскрипция
        result = model.transcribe(audio, batch_size=2, language=language)
        
        # Выравнивание
        if len(result["segments"]) > 0:
            try:
                result = whisperx.align(result["segments"], align_m, align_meta, audio, "cpu") # !!! НА LINUX ВЕРНУТЬ "cpu" на DEVICE !!!
            except Exception as e:
                print(f"Alignment failed: {e}")
        
        # === ФОРМАТИРУЕМ ДАННЫЕ ===
        all_words = []
        segments = []
        
        for seg in result["segments"]:
            seg_info = {
                "start": seg["start"],
                "end": seg["end"],
                "text": seg["text"].strip()
            }
            
            if "words" in seg and seg["words"]:
                for word in seg["words"]:
                    if isinstance(word, dict):
                        word_info = {
                            "word": word.get("word", ""),
                            "start": word.get("start"),
                            "end": word.get("end"),
                            "score": word.get("score")
                        }
                    else:
                        word_info = {
                            "word": word,
                            "start": None,
                            "end": None,
                            "score": None
                        }
                    all_words.append(word_info)
            
            segments.append(seg_info)
        
        if not all_words:
            for seg in segments:
                all_words.append({
                    "word": seg["text"],
                    "start": seg["start"],
                    "end": seg["end"],
                    "score": None
                })
        
        duration = segments[-1]["end"] if segments else 0
        full_text = " ".join([s['text'] for s in segments])
        
        response = {
            "words": all_words,
            "text": full_text,
            "segments": segments,
            "duration": duration
        }
        
        return jsonify(response)
        
    except Exception as e:
        print(f"❌ Ошибка во время выполнения WhisperX в /transcribe: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)

@app.route('/diarize', methods=['POST'])
def diarize():
    # Принудительно создаем папку tmp, если её нет
    os.makedirs('./tmp', exist_ok=True)
    audio_path = './tmp/audio_diarize.mp3'

    # Проверяем источник файла: прямая загрузка файла или временная ссылка S3
    if 'audio' in request.files:
        audio_file = request.files['audio']
        audio_file.save(audio_path)
    elif 'audioUrl' in request.form:
        audio_url = request.form.get('audioUrl')
        try:
            print(f"📥 Скачивание аудио для диаризации по S3-ссылке...")
            # Потоковое скачивание чанками по 8КБ для защиты ОЗУ сервера
            with requests.get(audio_url, stream=True) as r:
                r.raise_for_status()
                with open(audio_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
            print(f"✅ Файл для диаризации успешно скачан. Размер: {os.path.getsize(audio_path)} байт")
        except Exception as e:
            print(f"❌ Ошибка скачивания из S3 в /diarize: {str(e)}")
            return jsonify({"error": f"Failed to download audio from S3: {str(e)}"}), 500
    else:
        return jsonify({"error": "No audio file or audioUrl provided"}), 400
    
    language = request.form.get('language', 'ru')
    
    existing_segments = None
    if 'segments' in request.form:
        try:
            existing_segments = json.loads(request.form.get('segments', '[]'))
        except:
            existing_segments = None

    try:
        import whisperx
        import traceback
        
        if clip_model is not None:
            clear_gpu()
        
        diarize_m = get_diarization()
        
        print("👥 Определение спикеров...")
        audio_numpy = whisperx.load_audio(audio_path)
        waveform_tensor = torch.from_numpy(audio_numpy).unsqueeze(0)
        
        audio_input = {
            "waveform": waveform_tensor,
            "sample_rate": 16000
        }
        
        diarize_segments = diarize_m(audio_input)
        print(f"✅ Диаризация завершена")
        
        if existing_segments:
            print("🔧 Присваиваем спикеров к существующей транскрипции...")
            result = {"segments": existing_segments}
            result = whisperx.assign_word_speakers(diarize_segments, result)
        else:
            print("🎯 Транскрипция...")
            model, align_m, align_meta = get_whisper()
            result = model.transcribe(audio_numpy, batch_size=2, language=language)
            if len(result["segments"]) > 0:
                result = whisperx.align(result["segments"], align_m, align_meta, audio_numpy, "cpu") # !!! НА LINUX ВЕРНУТЬ "cpu" на DEVICE !!!
            result = whisperx.assign_word_speakers(diarize_segments, result)
        
        # === ФОРМАТИРУЕМ ===
        all_words = []
        segments = []
        speakers_set = set()
        
        for seg in result["segments"]:
            speaker = seg.get("speaker", "UNKNOWN")
            speakers_set.add(speaker)
            
            seg_info = {
                "start": seg["start"],
                "end": seg["end"],
                "text": seg["text"].strip(),
                "speaker": speaker
            }
            
            if "words" in seg and seg["words"]:
                for word in seg["words"]:
                    word_speaker = word.get("speaker", speaker) if isinstance(word, dict) else speaker
                    speakers_set.add(word_speaker)
                    
                    if isinstance(word, dict):
                        word_info = {
                            "word": word.get("word", ""),
                            "start": word.get("start"),
                            "end": word.get("end"),
                            "score": word.get("score"),
                            "speaker": word_speaker
                        }
                    else:
                        word_info = {
                            "word": word,
                            "start": None,
                            "end": None,
                            "score": None,
                            "speaker": word_speaker
                        }
                    all_words.append(word_info)
            
            segments.append(seg_info)
        
        if not all_words:
            for seg in segments:
                all_words.append({
                    "word": seg["text"],
                    "start": seg["start"],
                    "end": seg["end"],
                    "score": None,
                    "speaker": seg.get("speaker", "UNKNOWN")
                })
        
        duration = segments[-1]["end"] if segments else 0
        full_text = " ".join([s['text'] for s in segments])
        speakers = sorted(list(speakers_set))
        
        response = {
            "words": all_words,
            "text": full_text,
            "segments": segments,
            "duration": duration,
            "speakers": speakers
        }
        
        return jsonify(response)
        
    except Exception as e:
        print("=" * 60)
        print("❌ ПОЛНАЯ ОШИБКА В /diarize:")
        traceback.print_exc()
        print("=" * 60)
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)

@app.route('/analyze-frames', methods=['POST'])
def analyze_frames():
    data = request.json
    frames_dir = data['framesDir']
    
    # Выгружаем Whisper, если он был загружен
    if whisper_model is not None:
        clear_gpu()
    
    # Загружаем CLIP
    model, processor = get_clip()
    
    files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
    
    if not files:
        return jsonify({'frames': []})
    
    results = []
    batch_size = 16  # Уменьшите до 8, если вылетает ошибка
    
    for i in range(0, len(files), batch_size):
        batch_files = files[i:i+batch_size]
        batch_images = []
        batch_times = []
        
        for f in batch_files:
            img = Image.open(os.path.join(frames_dir, f))
            batch_images.append(img)
            try:
                frame_num = int(f.split('_')[1].split('.')[0])
                batch_times.append(frame_num - 1)
            except:
                batch_times.append(0)
        
        scene_texts = [f"a photo of a {c}" for c in CATEGORIES]
        scene_inputs = processor(text=scene_texts, images=batch_images, return_tensors='pt', padding=True).to(DEVICE)
        
        mood_texts = [f"a {m} atmosphere" for m in MOODS]
        mood_inputs = processor(text=mood_texts, images=batch_images, return_tensors='pt', padding=True).to(DEVICE)
        
        with torch.no_grad():
            scene_outputs = model(**scene_inputs)
            scene_probs = scene_outputs.logits_per_image.softmax(dim=1)
            
            mood_outputs = model(**mood_inputs)
            mood_probs = mood_outputs.logits_per_image.softmax(dim=1)
        
        for j in range(len(batch_images)):
            scene_idx = scene_probs[j].argmax().item()
            mood_idx = mood_probs[j].argmax().item()
            
            results.append({
                'time': batch_times[j],
                'sceneType': CATEGORIES[scene_idx],
                'mood': MOODS[mood_idx],
                'sceneConfidence': round(scene_probs[j][scene_idx].item(), 2),
                'moodConfidence': round(mood_probs[j][mood_idx].item(), 2)
            })
    
    return jsonify({'frames': results})

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'cuda': torch.cuda.is_available(),
        'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU',
        'whisperx_alignment': True
    })

if __name__ == '__main__':
    print("🚀 AI сервер (оптимизированный под 8 ГБ) запущен на http://localhost:8765")
    app.run(host='0.0.0.0', port=8765)