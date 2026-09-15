# Antigravity Kuralları

## Test ve Deneme Dosyaları Kuralı
- Tüm testler, test scriptleri, API denemeleri, kıyaslama (benchmark) ve geçici doğrulama kodları **yalnızca ve kesinlikle** projenin kökündeki `tests/` klasörü altına oluşturulmalıdır.
- `server/`, `src/` veya proje ana dizinine hiçbir zaman test dosyası oluşturulmamalıdır.
- `tests/` klasörü `.gitignore` kapsamındadır ve Git'e pushlanmaz.
