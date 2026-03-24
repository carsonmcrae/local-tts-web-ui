# Local Kokoro TTS Web UI

A local text-to-speech tool using Kokoro with a simple web interface.

## Features

- 50+ voice options
- Adjustable speech speed
- Voice preview with caching (fast after first load)
- Batch processing support
- Upload or browse text files
- Automatic model download on first run

## Demo

Run the app locally and open:

`http://127.0.0.1:7860`

Use the interface to select a voice, adjust speed, and generate speech from text files or uploads.

## Setup

1. Open Command Prompt

2. (Optional) Navigate to where you want the project saved, for example:

```
cd C:\Users\YourName\Desktop
```

    *(Note: You may want to create a dedicated folder for your projects first.)*

To create a new folder and move into it in Command Prompt use:

    `mkdir my-projects`

    `cd my-projects`

3. Navigate into the project folder:

    `cd kokoro-local-tts`

4. Create and activate virtual environment:

    `python -m venv venv`

    `venv\Scripts\activate`

5. Install dependencies:

    `pip install -r requirements.txt`

    *(Note: This installs required Python packages such as `gradio` and `kokoro-tts`, along with their dependencies. On first run, the app will automatically download the Kokoro model files (~350MB), including `kokoro-v1.0.onnx` and `voices-v1.0.bin`.)*

## Run

    `python kokoro_tts_ui.py`

On first run, required model files (~350MB) will be downloaded automatically.

## Usage

- Place `.txt` files in the **Text Prompts** folder to use the Browse feature
- Or upload a file directly in the UI
- Generated audio files are saved in the **outputs** folder

## Controls

### Start the app

    `cd C:\tts`

    `venv\Scripts\activate`

    `python kokoro_tts_ui.py`

### Stop the app

- Press: `Ctrl + C`
- If prompted: type `Y`

## Notes

- Voice previews are cached after first generation for faster playback
- Model files are not included in the repo and will download automatically