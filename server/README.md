# WMS Proxy (CANIAS / Mizoye)

Frontend'in WS şifresini görmeden gerçek servisleri kullanabilmesi için güvenli ara katman. Frontend buraya JSON atar, proxy WS kimlik bilgisini ekleyerek CANIAS SOAP servisini çağırır.

## Kurulum

```bash
cd server
npm install
cp .env.example .env   # .env'i doldurun (CANIAS_WSDL_URL, WMS_PASSWORD)
npm run dev
```

Proxy `http://localhost:8787` üzerinde çalışır. Frontend `.env` dosyasında:

```
VITE_WMS_BASE_URL=http://localhost:8787/api/mzy
VITE_WMS_MODE=live
```

## Uç noktalar

- `GET  /health` — durum
- `POST /api/mzy/:service` — `:service` ∈ { MZYCheckUser, MZYListingPick, MZYCreateContainer, MZYEnterPick, MZYClosePick }. Gövde: servis parametreleri (PCOMPANY, PSUSER, ...).

## Eksik

- `CANIAS_WSDL_URL` (Mizoye verecek) — girilince SOAP çağrıları çalışır.
- Servis **yanıt** alanları netleşince frontend'deki `src/api/mzy.ts` eşlemeleri doldurulacak.
