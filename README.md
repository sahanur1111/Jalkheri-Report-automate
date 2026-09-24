# Jalkheri Report Automation

Initial web app for the Jalkheri DCS report workflow.

## Run locally

pip install -r requirements.txt
uvicorn app:app --reload

Open http://127.0.0.1:8000

## Deploy

This repository includes `render.yaml` for Render deployment.

Workflow: upload the latest Excel file -> read the Jalkheri sheet -> detect the latest hourly column -> extract tag values -> display dashboard KPIs.
