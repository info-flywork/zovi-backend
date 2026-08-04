# Zovi API (Node.js)

Express + **mysql2** + **firebase-admin**. Auth: Flutter Firebase client → ID token → `POST /auth/sync` → MySQL upsert.

## Setup

```bash
cd backend
cp .env.example .env   # fill DB_* and credentials
npm install
npm run migrate
npm run dev
```

Firebase Admin için Console → Project settings → Service accounts → JSON indir → örn. `backend/zovi-7a4a7-firebase-adminsdk-….json` ve `.env` içinde `GOOGLE_APPLICATION_CREDENTIALS` yolunu ayarla.

## Endpoints

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/health` | — | App + DB health |
| GET | `/health/db` | — | Sadece DB |
| POST | `/auth/sync` | Bearer Firebase ID token | User upsert |
| GET | `/auth/me` | Bearer | Current user pack |
| GET | `/users/username/availability?username=` | Bearer | Unique check via `usernames` PK + suggestions |
| PATCH | `/users/me/profile` | Bearer | Profil güncelle (username unique) |
| POST | `/users/me/deletion-request` | Bearer | Hesap silme talebi (+30 gün grace) |
| GET | `/music/tracks?q=&limit=&offset=` | Bearer | Müzik kataloğu (pagination) |
| POST | `/music/suno/callback` | — | Suno webhook (opsiyonel; seed poll kullanır) |

## Suno katalog seed

AI müzik üretip `music_tracks` tablosuna yazar ([sunoapi.org](https://sunoapi.org/)):

1. `.env` içine `SUNO_API_KEY` ekle ([API Key](https://sunoapi.org/api-key))
2. İsteğe bağlı: `SUNO_CALLBACK_URL` (public URL; yoksa example.com placeholder)
3. Çalıştır:

```bash
npm run seed:suno           # ~15 generate job ≈ 30 track
npm run seed:suno -- --count=3
```

`GET /music/tracks` önce DB’den okur. Liste sonuna gelince Suno’dan yeni batch üretir, DB’ye kaydeder; aynı şarkı bir daha Suno’dan çekilmez.

## Models

`User`, `UserProfile`, `OAuthIdentity`, `UserOnboardingFlags`, `UserSettings` — `src/models/`.

Şema kaynağı: `docs/database-schema.md` (MySQL’e uyarlandı; `firebase_uid` eklendi).
