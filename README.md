# Podcast Editor

A lightweight Flask application for loading, editing, and exporting podcast RSS feeds entirely in memory. Users can import a feed via URL or file upload, tweak ordering or selection of episodes, edit podcast metadata, preview the generated RSS, and upload the result to Amazon S3.

## Features
- Import RSS by URL or file upload
- Edit podcast title and description
- Reverse or filter episodes, or manually deselect items
- Preview the regenerated RSS feed before uploading
- Upload the generated feed to an S3 bucket (no local persistence)

## Running locally
1. Create a virtual environment and install dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Set the target S3 bucket (required for uploads):
   ```bash
   export S3_BUCKET_NAME="your-bucket-name"
   export AWS_REGION="us-east-1"  # optional; defaults to us-east-1
   ```
3. Start the app:
   ```bash
   python app.py
   ```
4. Open http://localhost:5000 and load a feed by URL or upload.

## Docker
Build and run the app in Docker:
```bash
docker build -t podcast-editor .
docker run -p 5000:5000 \
  -e S3_BUCKET_NAME="your-bucket" \
  -e AWS_REGION="us-east-1" \
  -e AWS_ACCESS_KEY_ID="..." \
  -e AWS_SECRET_ACCESS_KEY="..." \
  podcast-editor
```

## Notes
- All edits happen in-memory; the only persistence is the uploaded file in S3.
- If S3 credentials are missing, uploads will return a clear error message while other functionality continues to work.
