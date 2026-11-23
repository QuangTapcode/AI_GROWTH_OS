# AI Growth OS AI service (FastAPI) for the Windows host's Docker Desktop. Build context: repository root.
# Dependencies come from services/ai/pyproject.toml. Tesseract is left out on purpose: the Windows host
# never had it, so the image guardrail behaves exactly as before.
FROM python:3.14-slim
WORKDIR /app
COPY services/ai/pyproject.toml services/ai/
RUN pip install --no-cache-dir $(python -c "import tomllib; print(' '.join(tomllib.load(open('services/ai/pyproject.toml','rb'))['project']['dependencies']))")
# Imported by src/ but missing from pyproject.toml; pinned to the versions the Windows host ran.
RUN pip install --no-cache-dir google-genai==2.7.0 python-dotenv==1.2.2
COPY services/ai/ services/ai/
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/healthz', timeout=4).status == 200 else 1)"
# Same environment the Windows launcher (infra/staging/agents-host.ps1) set up.
CMD ["sh", "-c", "export INTERNAL_AI_AUTH_TOKEN=\"$AUTOMATION_INTERNAL_TOKEN\"; exec python -m uvicorn src.app.main:app --app-dir services/ai --host 0.0.0.0 --port 5000"]
