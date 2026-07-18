# Aktüel Ofis · Depo Yönetim Uygulaması

Mobil öncelikli (responsive / WebView uyumlu) depo yönetim uygulaması. Vite + React + TypeScript ile geliştirilir. Siparişler CANIAS ERP'den gelir; depocu barkod okutarak siparişi toplar, tamamlanan miktarlar CANIAS'a geri gönderilir.

> Bu sürüm **tıklanabilir prototip**tir: veriler `src/mock` içindeki demo verisiyle çalışır. Gerçek servisler (Mizoye/Bora) hazır olunca sadece `src/api/client.ts` adapter katmanı gerçek endpoint'lere bağlanır — ekranlara dokunulmaz.

## Kurulum

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:5173` açılır. **Responsive web düzeni:** masaüstünde üst bar + sol menü + geniş çok kolonlu içerik; ekran daraldıkça sol menü hamburger menüye dönüşür ve içerik tek kolona iner (Android WebView / el terminali uyumlu).

Giriş: demo modunda **herhangi bir kullanıcı adı / parola** ile giriş yapabilirsiniz.

## Üretim derlemesi

```bash
npm run build      # dist/ üretir
npm run preview    # dist önizlemesi
```

## Ekranlar (bu adımda hazır)

- **Web kabuğu** — üst bar + sol menü (işlem geçişi), mobilde hamburger drawer
- **Login** — mock kimlik doğrulama (tam sayfa)
- **Ana Ekran (Dashboard)** — 6 işlem kartı, açık iş sayacı
- **Ayarlar** — firma / tesis / depo / dil (TR-EN)
- **Sipariş Toplama** — açık siparişler → detay (kamera barkod) → özet → CANIAS → tamamlandı
- **Mal Kabul** — gelen irsaliyeler → ürün tara → Lot/SKT girişi (modal) → özet → tamamlandı
- **Yerleştirme** — bekleyenler → ürün doğrula → önerilen/hedef lokasyon (elle onay) → yerleştir
- **Transfer** — işler → ürün doğrula → kaynak→hedef lokasyon (elle) + miktar → tamamla
- **Sayım** — sayım işleri → lokasyon → sistem/sayılan miktar, **fark** hesabı + not → tamamla
- **Ürün Sorgulama** — barkod ile toplam stok + lokasyon kırılımı (çok lokasyonda "tümünü gör")

> **Not (Bora):** Bu projede **raf/lokasyon barkodu okutma yoktur**. Yerleştirme ve transfer'de lokasyonlar taranmaz; önerilen değerle gelir, elle onaylanır/değiştirilir. Yalnızca **ürün barkodu** kamerayla okutulur.

## Sayfalama ve arama

Uzun liste ekranlarında (siparişler, irsaliyeler, yerleştirme, transfer, sayım) `src/components/Pagination.tsx` ile istemci-taraflı **sayfalama** + **arama** vardır (kart grid'inde sayfa başına 8-9 kayıt). Gerçek serviste sunucu-taraflı sayfalamaya (page/size parametreleri) kolayca çevrilir. Ürün sorgulamada çok lokasyonlu ürünlerde "Tüm Lokasyonları Gör" ile genişletme yapılır.

## Barkod okutma

`src/components/BarcodeScanner.tsx` — kamera tabanlı (zxing). Kamera izni yoksa otomatik **elle giriş** moduna düşer. Aynı barkodun sürekli okumada tekrar tetiklenmesini önleyen **debounce** (1.2 sn) vardır. Sunumda fiziksel barkod olmadan göstermek için **"örnek okut (demo)"** butonu vardır. İleride el terminali (HID klavye-wedge) desteği de aynı bileşene eklenebilir.

## Responsive davranış (mobil / tablet / web)

- **Mobil (< 1024px):** sol menü gizli, üstte hamburger → açılan drawer; içerik tek kolon, tam ekran; modaller alttan açılan sheet.
- **Tablet (768–1024px):** liste kartları 2 kolon; işlem/detay ekranları rahat aralık.
- **Web (≥ 1024px):** sabit sol menü + üst bar; içerik ortalanmış geniş alan (max ~1152px); dashboard 4 kolona, listeler 3 kolona; barkod tarayıcı detay ekranında solda **sticky** kalır.

## Proje yapısı

```
src/
  api/client.ts        # ADAPTER — gerçek servisler buraya bağlanır
  mock/                # demo verisi (data.ts, warehouse.ts)
  store/               # zustand (oturum, ayarlar, toplama, mal kabul)
  components/          # AppShell, BarcodeScanner, Pagination, Toast, vb.
  pages/               # login, home, settings, picking/receiving/putaway/transfer/count/inquiry
  locales/             # tr.json, en.json (i18n)
  types/               # ortak tipler
```

## Teknoloji

React 18 · Vite 5 · TypeScript · Tailwind CSS · React Router · zustand · react-i18next · @zxing (barkod) · lucide-react (ikon)
