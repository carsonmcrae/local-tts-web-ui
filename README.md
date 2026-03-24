# Local Kokoro TTS UI

A local text-to-speech tool using Kokoro with a simple web interface.

## Features
- 50+ voice options
- Adjustable speech speed
- Voice preview with caching
- Batch processing
- Automatic model download on first run

## Setup

1. Navigate to project folder:

    cd C:\tts

2. Create and activate virtual environment:

    python -m venv venv
    venv\Scripts\activate

3. Install dependencies:

    pip install -r requirements.txt

## Run

    python kokoro_tts_ui.py

On first run, required model files (~350MB) will be downloaded automatically.

## Notes
- Place .txt files in the Text Prompts folder to use the Browse feature
- Generated audio files are saved in the outputs folder

------------------------------------------------------------------------------

## Running the App (Windows)

### Start the app

1. Open Command Prompt  
2. Navigate to the project folder:
   
    cd C:\tts

3. Activate the virtual environment:
   
    venv\Scripts\activate

4. Start the app:
   
    python kokoro_tts_ui.py

---

### Stop the app

1. Go to the Command Prompt window running the app  
2. Press:

    Ctrl + C

3. If prompted:

    Terminate batch job (Y/N)?

   Type:

    Y

---

### Optional checks

- Confirm you are in the correct folder:

    dir

- Confirm the virtual environment is active:

    python --version