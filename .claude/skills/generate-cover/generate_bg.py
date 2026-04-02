#!/usr/bin/env python3
"""
Генерация фона обложки через Gemini API (с сохранением лица).
Fallback: возвращает оригинал с пометкой для HTML-шаблона.
"""

import sys
import os
import json
import shutil

def generate_with_gemini(frame_path, output_path):
    """Генерация фона через Gemini Image Editing."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ПРЕДУПРЕЖДЕНИЕ: GEMINI_API_KEY не найден. Используем fallback.")
        return False
    
    try:
        from google import genai
        from google.genai import types
        import pathlib
        
        client = genai.Client(api_key=api_key)
        
        # Читаем системный промпт
        system_prompt_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "agents", "cover-system", "system-prompt.txt"
        )
        
        prompt = "Edit this photo for an Instagram Reels cover: enhance colors, make the background more vibrant and professional, but KEEP THE FACE EXACTLY AS IT IS. Do not stylize, cartoon-ify, or alter the person's face in any way. The result should be 1080x1920 portrait orientation."
        
        if os.path.exists(system_prompt_path):
            with open(system_prompt_path, "r", encoding="utf-8") as f:
                prompt = f.read().strip() + "\n\n" + prompt
        
        # Загрузка изображения
        image_bytes = pathlib.Path(frame_path).read_bytes()
        
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=[
                types.Content(parts=[
                    types.Part.from_text(text=prompt),
                    types.Part.from_bytes(data=image_bytes, mime_type="image/png")
                ])
            ],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"]
            )
        )
        
        # Извлекаем изображение из ответа
        for part in response.candidates[0].content.parts:
            if hasattr(part, 'inline_data') and part.inline_data:
                with open(output_path, "wb") as f:
                    f.write(part.inline_data.data)
                return True
        
        print("ПРЕДУПРЕЖДЕНИЕ: Gemini не вернул изображение.")
        return False
        
    except Exception as e:
        print(f"ПРЕДУПРЕЖДЕНИЕ: Gemini ошибка: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Использование: python generate_bg.py <frame_path>")
        sys.exit(1)
    
    frame_path = sys.argv[1]
    if not os.path.exists(frame_path):
        print(f"ОШИБКА: Файл не найден: {frame_path}")
        sys.exit(1)
    
    # Определяем output — на 2 уровня выше cover_candidates/
    output_dir = os.path.dirname(os.path.dirname(frame_path))
    output_path = os.path.join(output_dir, "cover_bg_generated.png")
    
    print(f"Генерирую фон обложки из: {frame_path}")
    
    # Попытка 1: Gemini
    if generate_with_gemini(frame_path, output_path):
        print(f"✓ Фон сгенерирован через Gemini: {output_path}")
        method = "gemini"
    else:
        # Fallback: копируем оригинал (для последующей обработки через HTML-шаблон)
        shutil.copy2(frame_path, output_path)
        print(f"✓ Используем оригинальный кадр (для HTML-шаблона): {output_path}")
        method = "html_template_fallback"
    
    # Сохранить метод
    meta_path = os.path.join(output_dir, "cover_method.txt")
    with open(meta_path, "w") as f:
        f.write(method)

if __name__ == "__main__":
    main()
