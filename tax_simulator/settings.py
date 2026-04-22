import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def _env_bool(name: str, default: str = "false") -> bool:
    value = os.getenv(name, default)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}

SECRET_KEY = "django-insecure-tax-simulator-local-key"


INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "simulator",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "tax_simulator.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [],
        },
    },
]

WSGI_APPLICATION = "tax_simulator.wsgi.application"
ASGI_APPLICATION = "tax_simulator.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.dummy",
    }
}

LANGUAGE_CODE = "en-gb"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

ALLOWED_HOSTS = [
    "taxsimulator.retirementcapital.cloud",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
]
CSRF_TRUSTED_ORIGINS = [
    "https://taxsimulator.retirementcapital.cloud",
    "http://127.0.0.1:8002",
    "http://localhost:8002",
    "http://0.0.0.0:8002",
]

# Browsers do not store Secure cookies on plain HTTP (local runserver).
# Gunicorn behind nginx HTTPS: set DJANGO_USE_SSL_COOKIES=true in the service unit.
CSRF_COOKIE_SECURE = _env_bool("DJANGO_USE_SSL_COOKIES", "false")
SESSION_COOKIE_SECURE = _env_bool("DJANGO_USE_SSL_COOKIES", "false")

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

