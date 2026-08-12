

export const wmsConfig = {
  baseUrl: import.meta.env.VITE_WMS_BASE_URL ?? "", // backend proxy adresi
};

export const SERVICES = {
  checkUser: "MZYCheckUser", // Kullanıcı kontrol
  listingPick: "MZYListingPick", // Toplama emirleri listesi
  enterPick: "MZYEnterPick",
  closePick: "MZYClosePick", // Toplamaktan VAZGEÇ (tamamlama değil!)
  createContainer: "MZYCreateContainer", // Konteyner oluştur
  readBarcode: "MZYReadBarcode",
  readBarcodeSP: "MZYReadBarcodeSP",
  suggestPick: "MZYCrtSuggestListPickFromSP", // Stok yerinden toplama önerisi
  getStock: "MZYGetStock",
  savePick: "MZYSavePick",

  listingPlacement: "MZYListingPlacement", // yerleştirme emirleri listesi
  enterPlacement: "MZYEnterPlacement",
  closePlacement: "MZYClosePlacement", // yerleştirmeden VAZGEÇ
  savePlacement: "MZYSavePlacement",
  suggestPlacement: "MZYCrtSuggestListPlacement",

  getCompany: "GetCompany", // parametresiz
  getPlant: "GetPlant", // PSCOMPANY
  getWarehouse: "GetWarehouse", // PSCOMPANY, PSPLANT
  getStockPlace: "GetStockPlace", // PSCOMPANY, PSPLANT, PSWAREHOUSE

  printContainer: "MZYPrintContainer", // Konteyner/paket etiket yazdırma
  printWHSP: "MZYPrintWHSP", // Raf / Konteyner / Parti etiket yazdırma
  printMaterial: "MZYPrintMaterial", // Ürün barkodu etiket yazdırma
  printBarcode: "MZYPrintBarcode", // SKT / Parti barkod etiket yazdırma

  // Mal Kabul Servisleri
  getOpenOrder: "MZYGetOpenOrder", // Açık satın alma siparişleri listesi
  getMaterialDetail: "MZYGetMaterial", // Malzeme detay, resim, barkod ve ölçü listesi
  setMatSize: "MzySetMatSize", // Malzeme boyut, ağırlık ve güvenlik nitelikleri kaydı
} as const;
