// WMS / CANIAS (Mizoye) frontend yapılandırması.
// Frontend yalnızca backend proxy adresini bilir; WS kimlik bilgisi server tarafındadır.

export const wmsConfig = {
  baseUrl: import.meta.env.VITE_WMS_BASE_URL ?? "", // backend proxy adresi
};

/** Mizoye servis adları (proxy route'ları da bu adlarla). */
export const SERVICES = {
  checkUser: "MZYCheckUser", // Kullanıcı kontrol
  listingPick: "MZYListingPick", // Toplama emirleri listesi
  enterPick: "MZYEnterPick", // Emri toplamaya BAŞLA (+ kalem detayı)
  closePick: "MZYClosePick", // Toplamaktan VAZGEÇ (tamamlama değil!)
  createContainer: "MZYCreateContainer", // Konteyner oluştur
  readBarcode: "MZYReadBarcode", // Barkod okutma
  suggestPick: "MZYCrtSuggestListPickFromSP", // Stok yerinden toplama önerisi
  savePick: "MZYSavePick", // Toplamayı kaydet (MOVEDQTY) — parametreleri bekleniyor
  // Seçim listeleri — dokümanda var ama sunucuda "web service bulunamadı"
  // dönüyordu; adları/erişimi Bora ile teyit edilecek.
  getCompany: "GetCompany", // parametresiz
  getPlant: "GetPlant", // PSCOMPANY
  getWarehouse: "GetWarehouse", // PSCOMPANY, PSPLANT
} as const;
