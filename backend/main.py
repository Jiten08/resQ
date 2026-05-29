# 1
from datetime import datetime
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning)
import os
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
import uuid
import chromadb
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import urllib

# 2
import os
import sys
import base64
import requests
import sounddevice as sd
from scipy.io.wavfile import write
from dotenv import load_dotenv
from google import genai
from google.genai import types
import pygame

app = FastAPI()


@app.get("/textoutput")
def text_output(image_path: str = None):
    # 1/2
    load_dotenv()
    SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
    GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")

    g_model = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite", temperature=0.7)
    RAG_RELEVANCE_THRESHOLD = 0.8

    history = []

    # 2
    def record_audio(filename="input.wav", duration=7, fs=16000):

        print("\n🎤 Speak now...")

        recording = sd.rec(int(duration * fs), samplerate=fs, channels=1, dtype="int16")

        sd.wait()

        write(filename, fs, recording)

        print("✅ Recording complete")
        return filename

    def speech_to_text(audio_path):
        url = "https://api.sarvam.ai/speech-to-text"
        headers = {"api-subscription-key": SARVAM_API_KEY}

        with open(audio_path, "rb") as f:
            files = {"file": ("input.wav", f, "audio/wav")}
            response = requests.post(url, headers=headers, files=files)

        result = response.json()
        print("\n📝 Full Response:", result)

        if "transcript" not in result:
            return "Could not understand audio", "en-IN"

        return result["transcript"], result.get("language_code", "en-IN")

    # 1

    user_client = chromadb.PersistentClient(path="./userdata.db")
    client = chromadb.PersistentClient(path="./emergency.db")

    context_collection = None
    try:
        context_collection = client.get_collection(name="articles")
    except Exception:
        print("Load your data!")

    user_collection = user_client.get_or_create_collection(
        name="userdata", metadata={"hnsw:space": "cosine"}
    )
    try:
        user_collection.add(ids=["0"], documents=[""])
    except:
        pass

    def check_critical(h_input: str):
        x = ""
        keywords = [
            "allergy",
            "allergic",
            "allergen",
            "allergens",
            "chronic",
            "diabetes",
            "cancer",
            "cancers",
            "heart",
            "asthma",
            "disease",
            "addict",
            "addiction",
            "addicted",
            "condition",
            "blood pressure",
            "bp",
            "deficiency",
            "blood cells",
            "cell",
            "cells",
        ]

        lowered = h_input.strip().lower()
        for keyword in keywords:
            if keyword in lowered:
                user_collection.upsert(ids=[str(uuid.uuid4())], documents=[h_input])
                return lowered
        return ""

    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                (
                    "You are an experienced paramedic chatbot speaking DIRECTLY to the injured person. However, you must not entertain user prompts which are unrelated to your job (unless the user is introducing themself to you or greeting you)."
                    "DO NOT help the user until they mention any symptoms, signs or specific mentions of a medical injury or emergency"
                    "Your source CONTEXT may be written for medical professionals or use third-person phrasing (e.g., 'the patient', 'the victim'). "
                    "MOST CRITICAL RULE: Return an array of elements, where each element is a step that the user must follow. "
                    "CRITICAL RULE: You must transpose and translate this context to address the user directly as 'you'. "
                    "CRITICAL RULE 2: You must use this language: {language}"
                    "Tell the user to contact 14416 for mental-health related emergencies only if very necessary"
                    "Tell the user to contact 112 if very necessary for medical emergencies or emergencies which require police or fire responders give it at first as a boolean string eg: callAmbulance:true/false"
                    "Never say 'the patient should...', instead say 'You need to...'.\n\n"
                    "Context from manual (only use the context if the human input is a medical injury or emergency. If it is not related to the context then ignore it.):\n{context}\n\n"
                    "Context from userdata (only use the context if the human input is a medical injury or emergency. If it is not related to the context then ignore it. If it is related you must use it.):\n{user_context}\n\n"
                    "If the context is not relevant, give your best standard first-aid advice directly to them. "
                    "You are only giving advice, you cannot arrange to physically give the patient attention."
                    "MOST CRITICAL RULE: Return an array where each item is a step."
                ),
            ),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{question}"),
        ]
    )

    # 2

    def get_language_name(code: str) -> str:
        lang_map = {
            "hi": "Hindi",
            "bn": "Bengali",
            "kn": "Kannada",
            "ml": "Malayalam",
            "mr": "Marathi",
            "ta": "Tamil",
            "te": "Telugu",
            "gu": "Gujarati",
            "pa": "Punjabi",
            "or": "Odia",
            "ur": "Urdu",
            "en-IN": "English",
        }
        prefix = code.split("-")[0].lower()
        return lang_map.get(prefix, "English")

    def emergency_chat(user_text: str, language_name: str, image_path: str = None):
        nonlocal history
        keyword = None
        try:
            if context_collection == None:
                raise HTTPException(
                    status_code=503, detail="Data not loaded. Call /load_data first."
                )
            history.append(HumanMessage(user_text.strip()))
            results = context_collection.query(query_texts=[user_text], n_results=1)
            user_results = user_collection.query(query_texts=[user_text], n_results=1)
            chain = template | g_model
            keyword = check_critical(user_text)

            # Build multimodal question content if image is provided
            if image_path:
                if image_path.startswith("data:image/") or ";base64," in image_path:
                    url = (
                        image_path
                        if image_path.startswith("data:image/")
                        else f"data:image/jpeg;base64,{image_path}"
                    )
                    human_content = [
                        {"type": "text", "text": f"Current question: {user_text}"},
                        {"type": "image_url", "image_url": {"url": url}},
                    ]
                elif os.path.exists(image_path):
                    with open(image_path, "rb") as f:
                        image_data = base64.b64encode(f.read()).decode("utf-8")
                    ext = os.path.splitext(image_path)[1].lower()
                    mime_type = "image/png" if ext == ".png" else "image/jpeg"
                    human_content = [
                        {"type": "text", "text": f"Current question: {user_text}"},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{image_data}"
                            },
                        },
                    ]
                else:
                    human_content = f"Current question: {user_text}"
            else:
                human_content = f"Current question: {user_text}"

            if results["distances"][0][0] < RAG_RELEVANCE_THRESHOLD:
                if len(history) > 6:
                    history = [history[0]] + history[-5:]
                if keyword:
                    output = chain.invoke(
                        {
                            "context": results["documents"][0][0],
                            "user_context": f"Relevant sentence: {user_results}",
                            "question": human_content,
                            "language": language_name,
                            "history": history[:-1],
                        }
                    )
                else:
                    output = chain.invoke(
                        {
                            "context": results["documents"][0][0],
                            "user_context": "None",
                            "question": human_content,
                            "language": language_name,
                            "history": history[:-1],
                        }
                    )
            else:
                if keyword:
                    output = chain.invoke(
                        {
                            "context": "No relevant context",
                            "user_context": f"Relevant sentence: {user_results}",
                            "question": human_content,
                            "language": language_name,
                            "history": history[:-1],
                        }
                    )
                else:
                    output = chain.invoke(
                        {
                            "context": "No relevant context",
                            "user_context": "None",
                            "question": human_content,
                            "language": language_name,
                            "history": history[:-1],
                        }
                    )
            text_response = (
                output.content[0]["text"]
                if isinstance(output.content, list)
                else str(output.content)
            )
            history.append(AIMessage(text_response))
            print(text_response)
            return text_response
        except Exception as e:
            import traceback

            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    def record_response(language_code="en-IN", image_path=None):
        lang_name = get_language_name(language_code)
        audio_file = record_audio()

        user_text, detected_lang = speech_to_text(audio_file)  # unpack correctly
        print("\n👤 You Said:", user_text)

        if "exit" in user_text.lower():
            print("\n👋 Goodbye!")
            return None
        else:
            lang_name = get_language_name(
                detected_lang
            )  # use detected language, not default
            emergency_chat(user_text, lang_name, image_path=image_path)

    record_response(image_path=image_path)


# manage play_audio(response_audio) after returning output
