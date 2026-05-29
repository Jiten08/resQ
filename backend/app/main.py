import os
import re
import uuid
import base64
import requests
import tempfile
import chromadb
from datetime import datetime
from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    Form,
    status,
    Response,
    BackgroundTasks,
)
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.services.twilio_service import send_emergency_sms, send_emergency_whatsapp

# Load environment variables
load_dotenv()

app = FastAPI(title="ResQ Emergency Assistant API")

# Add CORS Middleware to allow requests from the React Native Expo app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolve DB paths relative to the project structure
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USERDATA_DB_PATH = os.path.join(BASE_DIR, "userdata.db")
EMERGENCY_DB_PATH = os.path.join(BASE_DIR, "emergency.db")

# Initialize ChromaDB Clients
try:
    user_client = chromadb.PersistentClient(path=USERDATA_DB_PATH)
    client = chromadb.PersistentClient(path=EMERGENCY_DB_PATH)
except Exception as e:
    print(f"Error initializing ChromaDB: {e}")
    user_client = None
    client = None

# Initialize Langchain ChatGoogleGenerativeAI Model
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")

g_model = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite", temperature=0.7, google_api_key=GOOGLE_API_KEY
)

RAG_RELEVANCE_THRESHOLD = 0.8
history = []

# First-Aid Prompts Template
template = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            (
                "You are an experienced paramedic chatbot speaking DIRECTLY to the injured person. "
                "However, you must not entertain user prompts which are unrelated to your job (unless the user is introducing themself to you or greeting you).\n"
                "DO NOT help the user until they mention any symptoms, signs or specific mentions of a medical injury or emergency.\n"
                "Your source CONTEXT may be written for medical professionals or use third-person phrasing (e.g., 'the patient', 'the victim').\n"
                "MOST CRITICAL RULE: Return your response as a clear, numbered list of steps (e.g. '1. Step one\\n2. Step two'), with one step per line. Do not include introductory or concluding remarks.\n"
                "CRITICAL RULE: You must transpose and translate this context to address the user directly as 'you'.\n"
                "CRITICAL RULE 2: You must use this language: {language}.\n"
                "Tell the user to contact 14416 for mental-health related emergencies only if very necessary.\n"
                "Tell the user to contact 112 if very necessary for medical emergencies or emergencies which require police or fire responders.\n"
                "Never say 'the patient should...', instead say 'You need to...'.\n\n"
                "Context from manual (only use the context if the human input is a medical injury or emergency. If it is not related to the context then ignore it.):\n{context}\n\n"
                "Context from userdata (only use the context if the human input is a medical injury or emergency. If it is not related to the context then ignore it. If it is related you must use it.):\n{user_context}\n\n"
                "If the context is not relevant, give your best standard first-aid advice directly to them.\n"
                "You are only giving advice, you cannot arrange to physically give the patient attention."
            ),
        ),
        MessagesPlaceholder(variable_name="history"),
        ("human", "{question}"),
    ]
)


def check_critical(h_input: str, user_collection):
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
            try:
                user_collection.upsert(ids=[str(uuid.uuid4())], documents=[h_input])
            except Exception as e:
                print(f"Error logging critical data: {e}")
            return lowered
    return ""


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
        "en": "English",
    }
    if not code:
        return "English"
    prefix = code.split("-")[0].lower()
    return lang_map.get(prefix, "English")


def speech_to_text(audio_data: bytes) -> tuple:
    if not SARVAM_API_KEY:
        return "Sarvam API Key not configured in backend", "en-IN"

    url = "https://api.sarvam.ai/speech-to-text"
    headers = {"api-subscription-key": SARVAM_API_KEY}

    try:
        files = {"file": ("input.wav", audio_data, "audio/wav")}
        response = requests.post(url, headers=headers, files=files)

        if response.status_code != 200:
            print(
                f"Sarvam STT failed with status {response.status_code}: {response.text}"
            )
            return "Could not understand audio", "en-IN"

        result = response.json()
        print("\n📝 Sarvam STT Full Response:", result)

        if "transcript" not in result:
            return "Could not understand audio", "en-IN"

        return result["transcript"], result.get("language_code", "en-IN")
    except Exception as e:
        print(f"Error calling Sarvam STT: {e}")
        return "Could not understand audio", "en-IN"


def clean_steps(text: str) -> list:
    raw_lines = text.split("\n")
    steps = []
    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        # Remove markdown bold/italics
        line = re.sub(r"[*_#`]", "", line)
        # Remove leading numbers, periods, spaces, bullets (e.g., "1. ", "Step 1: ", "• ")
        cleaned = re.sub(r"^(?:Step\s+)?\d+[\s.:)-]+\s*", "", line)
        cleaned = re.sub(r"^[-*•\s]+\s*", "", cleaned)
        if cleaned:
            steps.append(cleaned)
    return steps


@app.get("/")
def read_root():
    return {"message": "ResQ Assistant Backend is running!"}


@app.post("/api/process")
async def process_emergency(
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(None),
    image: UploadFile = File(None),
    language: str = Form("en-IN"),
):
    global history
    detected_text = "Emergency trigger without voice."
    detected_lang = language

    # 1. Process voice audio if provided
    if audio:
        try:
            audio_bytes = await audio.read()
            # Convert speech to text
            detected_text, detected_lang = speech_to_text(audio_bytes)
        except Exception as e:
            print(f"Error handling audio file: {e}")
            detected_text = "Speech recognition failed."

    print(f"\n👤 Transcript: {detected_text} (Language: {detected_lang})")

    # 2. Setup Vector DB Collections
    context_collection = None
    user_collection = None
    if client and user_client:
        try:
            context_collection = client.get_collection(name="articles")
        except Exception as e:
            print(f"Emergency articles collection not found: {e}")

        try:
            user_collection = user_client.get_or_create_collection(
                name="userdata", metadata={"hnsw:space": "cosine"}
            )
        except Exception as e:
            print(f"Userdata collection initialization failed: {e}")

    # Log critical keyword details
    keyword = ""
    if user_collection:
        keyword = check_critical(detected_text, user_collection)

    # 3. Retrieve database context
    context_text = "No relevant first aid context available."
    user_context_text = "None"

    if context_collection and detected_text:
        try:
            results = context_collection.query(query_texts=[detected_text], n_results=1)
            if (
                results
                and results.get("distances")
                and results["distances"][0][0] < RAG_RELEVANCE_THRESHOLD
            ):
                context_text = results["documents"][0][0]
        except Exception as e:
            print(f"Querying context database failed: {e}")

    if user_collection and detected_text and keyword:
        try:
            user_results = user_collection.query(
                query_texts=[detected_text], n_results=1
            )
            if user_results and user_results.get("documents"):
                user_context_text = f"Relevant user background sentence: {user_results['documents'][0][0]}"
        except Exception as e:
            print(f"Querying user database failed: {e}")

    # 4. Handle Multimodal Input (Image)
    human_content = [{"type": "text", "text": f"Current question: {detected_text}"}]

    if image:
        try:
            image_data = await image.read()
            base64_image = base64.b64encode(image_data).decode("utf-8")
            mime_type = image.content_type or "image/jpeg"
            image_url = f"data:{mime_type};base64,{base64_image}"
            human_content.append({"type": "image_url", "image_url": {"url": image_url}})
            print("📸 Multi-modal image input processed.")
        except Exception as e:
            print(f"Error handling image file: {e}")

    # 5. Query Gemini via Langchain
    language_name = get_language_name(detected_lang)
    chain = template | g_model

    try:
        # Maintain history window size
        if len(history) > 6:
            history = [history[0]] + history[-5:]

        # Add current human message to local history copy for chaining
        current_history = history.copy()

        output = chain.invoke(
            {
                "context": context_text,
                "user_context": user_context_text,
                "question": human_content
                if image
                else f"Current question: {detected_text}",
                "language": language_name,
                "history": current_history,
            }
        )

        text_response = (
            output.content[0]["text"]
            if isinstance(output.content, list)
            else str(output.content)
        )

        # Append exchange to active conversation history
        history.append(HumanMessage(detected_text))
        history.append(AIMessage(text_response))

        print("\n🤖 AI Assistant Response:")
        print(text_response)

        # Parse steps out of the response text
        parsed_steps = clean_steps(text_response)

        # Dispatch Twilio WhatsApp (with summary)
        def dispatch_whatsapp():
            try:
                summary_prompt = f"Summarize the following emergency situation and response in 2 concise sentences for an emergency contact:\nSituation: {detected_text}"
                whatsapp_summary_res = g_model.invoke(
                    [HumanMessage(content=summary_prompt)]
                )
                summary_text = whatsapp_summary_res.content
                if isinstance(summary_text, list):
                    summary_text = " ".join(
                        [
                            part.get("text", "")
                            for part in summary_text
                            if isinstance(part, dict) and "text" in part
                        ]
                    )
                elif not isinstance(summary_text, str):
                    summary_text = str(summary_text)
                send_emergency_whatsapp(summary_text)
            except Exception as e:
                print(f"Failed to generate and send WhatsApp summary: {e}")

        background_tasks.add_task(dispatch_whatsapp)

        # If Gemini returned no steps (e.g. simple greeting), return a fallback single step list
        if not parsed_steps:
            parsed_steps = [text_response]

        return {
            "steps": parsed_steps,
            "detected_text": detected_text,
            "language_code": detected_lang,
        }

    except Exception as e:
        print(f"Error during Gemini Chain processing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class TTSRequest(BaseModel):
    text: str
    language_code: str = "en-IN"


@app.post("/api/call-ambulance")
async def call_ambulance_endpoint(background_tasks: BackgroundTasks):
    # Trigger SMS to Number 1
    background_tasks.add_task(send_emergency_sms, "blah")

    # Generate and send WhatsApp message to Number 2
    def dispatch_ambulance_whatsapp():
        try:
            summary_prompt = "Generate a short, urgent 2-sentence WhatsApp alert stating that an ambulance has been called and dispatched for the victim's location."
            whatsapp_summary_res = g_model.invoke(
                [HumanMessage(content=summary_prompt)]
            )
            summary_text = whatsapp_summary_res.content
            if isinstance(summary_text, list):
                summary_text = " ".join(
                    [
                        part.get("text", "")
                        for part in summary_text
                        if isinstance(part, dict) and "text" in part
                    ]
                )
            elif not isinstance(summary_text, str):
                summary_text = str(summary_text)
            send_emergency_whatsapp(summary_text)
        except Exception as e:
            print(f"Failed to generate and send ambulance WhatsApp alert: {e}")

    background_tasks.add_task(dispatch_ambulance_whatsapp)

    return {"message": "Ambulance called. SMS and WhatsApp dispatched."}


@app.post("/api/tts")
async def text_to_speech_endpoint(req: TTSRequest):
    if not SARVAM_API_KEY:
        raise HTTPException(status_code=500, detail="Sarvam API Key not configured")

    url = "https://api.sarvam.ai/text-to-speech"
    payload = {
        "inputs": [req.text],
        "target_language_code": req.language_code,
        "speaker": "ritu",  # beautiful Indian female voice
        "model": "bulbul:v3",
    }
    headers = {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            data = response.json()
            base64_audio = data["audios"][0]
            return {"audio_content": base64_audio}
        else:
            print(
                f"Sarvam TTS failed with status {response.status_code}: {response.text}"
            )
            raise HTTPException(status_code=response.status_code, detail=response.text)
    except Exception as e:
        print(f"Error calling Sarvam TTS: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def remove_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
            print(f"[Backend] Temporary audio file removed: {path}")
    except Exception as e:
        print(f"[Backend] Error removing temporary file {path}: {e}")


@app.get("/api/tts_stream")
async def tts_stream_endpoint(
    text: str, background_tasks: BackgroundTasks, language_code: str = "en-IN"
):
    if not SARVAM_API_KEY:
        raise HTTPException(status_code=500, detail="Sarvam API Key not configured")

    url = "https://api.sarvam.ai/text-to-speech"
    payload = {
        "inputs": [text],
        "target_language_code": language_code,
        "speaker": "ritu",
        "model": "bulbul:v3",
    }
    headers = {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            data = response.json()
            audio_bytes = base64.b64decode(data["audios"][0])

            # Create a unique temporary file on the server in the system temp directory
            temp_file_path = os.path.join(
                tempfile.gettempdir(), f"resq_tts_{uuid.uuid4()}.wav"
            )
            with open(temp_file_path, "wb") as f:
                f.write(audio_bytes)

            # Schedule file deletion in the background after response has been completed and sent
            background_tasks.add_task(remove_file, temp_file_path)

            return FileResponse(
                path=temp_file_path,
                media_type="audio/wav",
                filename="first_aid_step.wav",
            )
        else:
            print(
                f"Sarvam TTS failed with status {response.status_code}: {response.text}"
            )
            raise HTTPException(status_code=response.status_code, detail=response.text)
    except Exception as e:
        print(f"Error calling Sarvam TTS: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/check_command")
async def check_command(audio: UploadFile = File(...)):
    try:
        audio_bytes = await audio.read()
        detected_text, _ = speech_to_text(audio_bytes)
    except Exception as e:
        print(f"Error handling command audio file: {e}")
        return {"command": "none", "transcript": ""}

    cleaned = detected_text.strip().lower()
    print(f"🎙️ Command Transcript: '{cleaned}'")

    # 3. Detect wake word command
    if "next" in cleaned:
        return {"command": "next", "transcript": detected_text}
    elif "prev" in cleaned or "previous" in cleaned or "back" in cleaned:
        return {"command": "previous", "transcript": detected_text}

    return {"command": "none", "transcript": detected_text}
