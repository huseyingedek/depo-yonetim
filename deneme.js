// Bu dosya deneme ve test amaçlı oluşturulmuş geçici bir dosyadır.

function selamVer(isim) {
  const rastgeleSayi = Math.floor(Math.random() * 100) + 1;
  console.log(`Merhaba ${isim}! Günün şanslı sayısı: ${rastgeleSayi}`);
  return rastgeleSayi;
}

// Örnek gereksiz test fonksiyonu
const sonuc = selamVer("Geliştirici");
console.log("Hesaplama tamamlandı:", sonuc * 2);
