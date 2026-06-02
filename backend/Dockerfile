FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    poppler-utils \
    libmagic1 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

ARG INSTALL_DEV=false
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
    if [ "$INSTALL_DEV" = "true" ]; then pip install --no-cache-dir -r requirements-dev.txt; fi

# Download NLTK data required by unstructured for sentence tokenization
RUN python -c "import nltk; nltk.download('punkt_tab'); nltk.download('averaged_perceptron_tagger_eng')"

COPY . .

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--worker-class", "gthread", "--threads", "4"]
