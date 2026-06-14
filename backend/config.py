import os
import re
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
TOKEN_DAYS = 7
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')

# Stream Video (audio/video calling). Secret is server-side only; never sent to clients.
STREAM_API_KEY = os.environ.get('STREAM_API_KEY')
STREAM_API_SECRET = os.environ.get('STREAM_API_SECRET')
STREAM_TOKEN_TTL_SECONDS = 24 * 60 * 60  # client tokens valid for 24h

USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

TERMS_VERSION = "2026-06-01"
LOCK_THRESHOLD = 5
LOCK_MINUTES = 15
MAX_VERIFY_ATTEMPTS_PER_DAY = 5
MIN_FACE_CONFIDENCE = 70
DELETE_FOR_EVERYONE_WINDOW_MIN = 60  # WhatsApp-style window
STAFF_ROLES = {"admin", "manager", "supervisor"}

COUNTRIES = [
    {"code": "IN", "name": "India", "id_types": ["Aadhaar Card", "PAN Card", "Passport", "Driving License", "Voter ID"]},
    {"code": "US", "name": "United States", "id_types": ["Passport", "Driver's License", "State ID Card"]},
    {"code": "GB", "name": "United Kingdom", "id_types": ["Passport", "Driving Licence", "Biometric Residence Permit"]},
    {"code": "CA", "name": "Canada", "id_types": ["Passport", "Driver's License", "Provincial ID Card"]},
    {"code": "AU", "name": "Australia", "id_types": ["Passport", "Driver's Licence", "Proof of Age Card"]},
    {"code": "DE", "name": "Germany", "id_types": ["Personalausweis (National ID)", "Passport", "Driving Licence"]},
    {"code": "FR", "name": "France", "id_types": ["Carte Nationale d'Identite", "Passport", "Driving Licence"]},
    {"code": "AE", "name": "United Arab Emirates", "id_types": ["Emirates ID", "Passport"]},
    {"code": "SG", "name": "Singapore", "id_types": ["NRIC", "Passport", "Driving Licence"]},
    {"code": "PK", "name": "Pakistan", "id_types": ["CNIC", "Passport", "Driving License"]},
    {"code": "BD", "name": "Bangladesh", "id_types": ["National ID Card", "Passport", "Driving License"]},
    {"code": "NG", "name": "Nigeria", "id_types": ["National ID Card (NIN)", "Passport", "Driver's License", "Voter's Card"]},
    {"code": "BR", "name": "Brazil", "id_types": ["RG (Identity Card)", "CNH (Driver's License)", "Passport"]},
    {"code": "MX", "name": "Mexico", "id_types": ["INE Voter ID", "Passport", "Driver's License"]},
    {"code": "JP", "name": "Japan", "id_types": ["My Number Card", "Driver's License", "Passport"]},
    {"code": "PH", "name": "Philippines", "id_types": ["PhilSys ID", "Passport", "Driver's License", "UMID"]},
    {"code": "ID", "name": "Indonesia", "id_types": ["KTP", "Passport", "Driving License (SIM)"]},
    {"code": "ZA", "name": "South Africa", "id_types": ["Smart ID Card", "Passport", "Driver's License"]},
    {"code": "OTHER", "name": "Other", "id_types": ["Passport", "National ID Card", "Driver's License"]},
]
COUNTRY_NAMES = {c["code"]: c["name"] for c in COUNTRIES}
