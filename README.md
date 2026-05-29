# resQLink

resQLink is an emergency response and first aid assistance platform consisting of a React Native mobile application, a FastAPI backend, an AI pipeline for speech-to-text, retrieval-augmented generation (RAG), and text-to-speech, and a Red Cross first-aid knowledge base.

## Project Structure

```
resQlink/
├── .github/                  # GitHub actions for CI/CD workflows
├── mobile-app/               # 1. React Native Expo Frontend
│   ├── assets/               # Splash screens, icons, etc.
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── navigation/       # App navigation (Expo Router or React Navigation)
│   │   ├── screens/          # App screens (e.g., HomeScreen, SOSScreen)
│   │   ├── services/         # API client to talk to the FastAPI backend
│   │   └── utils/            # Helper functions
│   ├── App.js                # App entry point
│   ├── package.json          # Frontend dependencies
│   └── app.json              # Expo configuration
│
├── backend/                  # 4. FastAPI Backend
│   ├── app/
│   │   ├── api/              # API routes/endpoints (e.g., twilio_routes.py)
│   │   ├── core/             # Config files, security, Twilio initialization
│   │   ├── services/         # Business logic (triggering SMS/calls via Twilio)
│   │   └── main.py           # FastAPI app entry point
│   ├── Dockerfile            # Container definition for backend service
│   ├── requirements.txt      # Python dependencies for backend
│   └── .env.example          # Template for backend environment variables
│
├── ai-pipeline/              # 2. Speech-to-Text, RAG, & TTS Pipeline
│   ├── src/
│   │   ├── stt/              # Speech-to-Text scripts (e.g., Whisper integration)
│   │   ├── rag/              # RAG logic (embeddings, vector store setup, LLM prompting)
│   │   └── tts/              # Text-to-Speech scripts
│   ├── main_pipeline.py      # Main execution script tying STT -> RAG -> TTS together
│   ├── requirements.txt      # Python dependencies for AI pipeline
│   └── .env.example          # Template for AI pipeline environment variables
│
├── knowledge-base/           # 3. Red Cross First Aid Document & Vector DB data
│   ├── raw-documents/        # original Red Cross PDF/text files (e.g., red_cross_first_aid.pdf)
│   ├── processed-chunks/     # Pre-processed/cleaned text chunks
│   └── vector-store/         # Local vector DB files (e.g., FAISS/ChromaDB instances)
│
├── .gitignore                # Git ignore files configuration
└── docker-compose.yml        # Docker compose config to run Backend, AI, and Vector DB locally
```

## Getting Started

To run the full resQLink platform, you will need to start the WebSocket server, the FastAPI backend, the AI Pipeline, and the Expo mobile app.

### 1. WebSocket Server (Emergency Hub)
Run the root Node.js server which handles emergency socket connections:
```bash
npm install
npm run server
# Or alternatively: node server.js
```

### 2. Backend (FastAPI)
Navigate to `backend/` to configure and run the FastAPI server:
```bash
cd backend
# Setup virtual environment and install dependencies
python -m venv .venv
source .venv/bin/activate  # Or .venv\Scripts\activate on Windows
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload
# Or using fastapi cli: fastapi dev main.py
```

### 3. AI Pipeline
Navigate to `ai-pipeline/` to set up and run the pipeline tools:
```bash
cd ai-pipeline
# Setup virtual environment and install dependencies
python -m venv .venv
source .venv/bin/activate  # Or .venv\Scripts\activate on Windows
pip install -r requirements.txt

# Run the main pipeline
python main_pipeline.py
```

### 4. Mobile App (Expo)
Navigate to the `mobile-app/` directory, install dependencies, and start the Expo app:
```bash
cd mobile-app
npm install

# Start the Expo development server
npm run start
# Press 'a' to open on Android, 'i' to open on iOS, or scan the QR code with the Expo Go app.
```
