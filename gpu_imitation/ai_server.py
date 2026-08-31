import os
import json
import torch
import gc
import subprocess
import traceback
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from pyannote.audio import Pipeline

app = Flask(__name__)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
HF_TOKEN = os.environ.get('HF_TOKEN', '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')

# S3 конфигурация
S3_ENDPOINT = os.environ.get('S3_ENDPOINT', 'https://s3.ru1.storage.beget.cloud')
S3_BUCKET = os.environ.get('S3_BUCKET', '1fbd2026a312-syncue-mate')
S3_ACCESS_KEY = os.environ.get('S3_ACCESS_KEY', 'IXGUJIXO2BU38TVDW49Y')
S3_SECRET_KEY = os.environ.get('S3_SECRET_KEY', '0Adx3ZvML2CEdJ4F6em1le0VwxLCDTK0SDQgY545')

# Импорт boto3 для S3
import boto3
from botocore.client import Config

s3_client = boto3.client(
    's3',
    endpoint_url=S3_ENDPOINT,
    aws_access_key_id=S3_ACCESS_KEY,
    aws_secret_access_key=S3_SECRET_KEY,
    region_name='ru-1',
    config=Config(signature_version='s3v4'),
)

# Временная папка на GPU сервере
TMP_DIR = '/tmp/noite'
os.makedirs(TMP_DIR, exist_ok=True)

# Глобальные переменные для моделей
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
    global whisper_model, align_model, align_metadata, clip_model, clip_processor, diarize_model
    whisper_model = None
    align_model = None
    align_metadata = None
    clip_model = None
    clip_processor = None
    diarize_model = None
    gc.collect()
    torch.cuda.empty_cache()
    print("🧹 GPU память очищена")

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

def get_diarization():
    global diarize_model
    if diarize_model is None:
        print("Загрузка Diarization (Pyannote)...")
        diarize_model = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            token=HF_TOKEN
        )
        if DEVICE == "cuda":
            diarize_model = diarize_model.to(torch.device("cuda"))
    return diarize_model

def download_from_s3(s3_key, local_path):
    s3_client.download_file(S3_BUCKET, s3_key, local_path)
    return local_path

def upload_to_s3(local_path, s3_key):
    s3_client.upload_file(local_path, S3_BUCKET, s3_key)
    return s3_key

@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Транскрипция аудиофайла.
    Принимает: audio файл или s3Key для скачивания
    """
    try:
        import whisperx
        
        if clip_model is not None:
            clear_gpu()
        
        model, align_m, align_meta = get_whisper()
        
        # Определяем источник аудио
        audio_path = os.path.join(TMP_DIR, 'audio_input.mp3')
        
        if 'audio' in request.files:
            audio_file = request.files['audio']
            audio_file.save(audio_path)
        elif 's3Key' in request.form:
            s3_key = request.form.get('s3Key')
            download_from_s3(s3_key, audio_path)
        else:
            return jsonify({"error": "No audio file or s3Key"}), 400
        
        language = request.form.get('language', 'ru')
        
        audio = whisperx.load_audio(audio_path)
        result = model.transcribe(audio, batch_size=8, language=language)
        
        if len(result["segments"]) > 0:
            result = whisperx.align(result["segments"], align_m, align_meta, audio, DEVICE)
        
        # Форматирование
        all_words = []
        segments = []
        
        for seg in result["segments"]:
            seg_info = {"start": seg["start"], "end": seg["end"], "text": seg["text"].strip()}
            if "words" in seg and seg["words"]:
                for word in seg["words"]:
                    if isinstance(word, dict):
                        word_info = {"word": word.get("word", ""), "start": word.get("start"), "end": word.get("end"), "score": word.get("score")}
                    else:
                        word_info = {"word": word, "start": None, "end": None, "score": None}
                    all_words.append(word_info)
            segments.append(seg_info)
        
        duration = segments[-1]["end"] if segments else 0
        full_text = " ".join([s['text'] for s in segments])
        
        return jsonify({"words": all_words, "text": full_text, "segments": segments, "duration": duration})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)

@app.route('/diarize', methods=['POST'])
def diarize():
    try:
        import whisperx
        
        if clip_model is not None:
            clear_gpu()
        
        diarize_m = get_diarization()
        
        audio_path = os.path.join(TMP_DIR, 'audio_diarize.mp3')
        
        if 'audio' in request.files:
            audio_file = request.files['audio']
            audio_file.save(audio_path)
        elif 's3Key' in request.form:
            s3_key = request.form.get('s3Key')
            download_from_s3(s3_key, audio_path)
        else:
            return jsonify({"error": "No audio file or s3Key"}), 400
        
        language = request.form.get('language', 'ru')
        existing_segments = None
        if 'segments' in request.form:
            try:
                existing_segments = json.loads(request.form.get('segments', '[]'))
            except:
                existing_segments = None
        
        audio_numpy = whisperx.load_audio(audio_path)
        waveform_tensor = torch.from_numpy(audio_numpy).unsqueeze(0)
        audio_input = {"waveform": waveform_tensor, "sample_rate": 16000}
        
        print("👥 Определение спикеров...")
        diarize_segments = diarize_m(audio_input)
        
        if existing_segments:
            result = {"segments": existing_segments}
            result = whisperx.assign_word_speakers(diarize_segments, result)
        else:
            model, align_m, align_meta = get_whisper()
            result = model.transcribe(audio_numpy, batch_size=8, language=language)
            if len(result["segments"]) > 0:
                result = whisperx.align(result["segments"], align_m, align_meta, audio_numpy, DEVICE)
            result = whisperx.assign_word_speakers(diarize_segments, result)
        
        # Форматирование с спикерами
        all_words = []
        segments = []
        speakers_set = set()
        
        for seg in result["segments"]:
            speaker = seg.get("speaker", "UNKNOWN")
            speakers_set.add(speaker)
            seg_info = {"start": seg["start"], "end": seg["end"], "text": seg["text"].strip(), "speaker": speaker}
            
            if "words" in seg and seg["words"]:
                for word in seg["words"]:
                    word_speaker = word.get("speaker", speaker) if isinstance(word, dict) else speaker
                    speakers_set.add(word_speaker)
                    
                    if isinstance(word, dict):
                        word_info = {"word": word.get("word", ""), "start": word.get("start"), "end": word.get("end"), "score": word.get("score"), "speaker": word_speaker}
                    else:
                        word_info = {"word": word, "start": None, "end": None, "score": None, "speaker": word_speaker}
                    all_words.append(word_info)
            
            segments.append(seg_info)
        
        duration = segments[-1]["end"] if segments else 0
        speakers = sorted(list(speakers_set))
        
        return jsonify({"words": all_words, "segments": segments, "duration": duration, "speakers": speakers})
        
    except Exception as e:
        print("=" * 60)
        traceback.print_exc()
        print("=" * 60)
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)

@app.route('/analyze-frames', methods=['POST'])
def analyze_frames():
    try:
        data = request.json
        frames_dir = data.get('framesDir')
        
        # Поддержка S3: если framesDir это s3:// ключ
        if frames_dir and frames_dir.startswith('s3://'):
            s3_prefix = frames_dir.replace('s3://', '')
            # Скачиваем все jpg из S3
            local_frames_dir = os.path.join(TMP_DIR, 'frames')
            os.makedirs(local_frames_dir, exist_ok=True)
            
            # Получаем список файлов
            response = s3_client.list_objects_v2(Bucket=S3_BUCKET, Prefix=s3_prefix)
            for obj in response.get('Contents', []):
                key = obj['Key']
                if key.endswith('.jpg'):
                    local_path = os.path.join(local_frames_dir, os.path.basename(key))
                    s3_client.download_file(S3_BUCKET, key, local_path)
            
            frames_dir = local_frames_dir
        
        if whisper_model is not None:
            clear_gpu()
        
        model, processor = get_clip()
        
        files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.jpg')])
        
        if not files:
            return jsonify({'frames': []})
        
        results = []
        batch_size = 16
        
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
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'cuda': torch.cuda.is_available(),
        'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'
    })

if __name__ == '__main__':
    print("🚀 AI сервер запущен на http://localhost:8765")
    app.run(host='0.0.0.0', port=8765)