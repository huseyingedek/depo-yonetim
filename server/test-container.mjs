// -----------------------------------------------------------------------------
// MZYCreateContainer — çalışıyor mu, hangi parametreleri istiyor?
// -----------------------------------------------------------------------------
// ⚠⚠ BU SERVİS MUHTEMELEN VERİ YAZAR — gerçek konteyner oluşturabilir.
//    Bu yüzden varsayılan olarak SADECE KEŞİF yapar (parametresiz + eksik
//    parametreyle çağırıp hata mesajını okur). Gerçek oluşturma denemesi için
//    komuta açıkça "--yaz" eklemek gerekir.
//
// Kodda şu an PSMATERIAL="KONPAKET" gönderiliyor ama bu değer TAHMİN,
// Bora'dan gelmedi. Amaç: servis ne istiyor, onu öğrenmek.
//
// Çalıştırma:
//   node test-container.mjs            → keşif (yazma denemesi yok)
//   node test-container.mjs --yaz      → gerçek oluşturma da denenir
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const YAZ = process.argv.includes("--yaz");

const V1_WSDL =
  process.env.CANIAS_WSDL_V1 ||
  "http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl";

const {
  CANIAS_CLIENT = "00", CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER = "CANIAS", CANIAS_DBNAME = "AKTUEL",
  CANIAS_APPSERVER = "192.168.22.16:27499",
  WMS_USER, WMS_PASSWORD,
  T_COMPANY = "01", T_PLANT = "100", T_WAREHOUSE = "D1",
} = process.env;

function val(x) {
  if (x === null || x === undefined) return x;
  if (Array.isArray(x)) return x.map(val);
  if (typeof x === "object") {
    if ("$value" in x) return x.$value;
    const out = {};
    for (const [k, v] of Object.entries(x)) {
      if (k === "attributes") continue;
      out[k] = val(v);
    }
    return Object.keys(out).length ? out : "";
  }
  return x;
}
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xml = (o) =>
  `<PARAMETERS>${Object.entries(o).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</PARAMETERS>`;

function flatten(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const el of value) {
        if (el && typeof el === "object") Object.assign(out, el["#item"] ?? el);
        else if (out[key] === undefined) out[key] = el;
      }
    } else if (value && typeof value === "object") {
      Object.assign(out, value["#item"] ?? value);
    } else out[key] = value;
  }
  return out;
}
function unwrap(t) {
  if (!t) return [];
  if (Array.isArray(t)) return t.map(flatten);
  if (typeof t === "object") return "ROW" in t ? unwrap(t.ROW) : [flatten(t)];
  return [];
}

const client = await soap.createClientAsync(V1_WSDL, { timeout: 20000 });
const [lres] = await client.loginAsync({
  p_strClient: CANIAS_CLIENT, p_strLanguage: CANIAS_LANGUAGE,
  p_strDBName: CANIAS_DBNAME, p_strDBServer: CANIAS_DBSERVER,
  p_strAppServer: CANIAS_APPSERVER,
  p_strUserName: WMS_USER, p_strPassword: WMS_PASSWORD,
});
const sessionId = val(lres?.loginReturn ?? lres);
if (!sessionId || typeof sessionId !== "string") {
  console.error("✗ Login başarısız:", sessionId);
  process.exit(1);
}
console.log("✓ Login OK\n");

async function dene(etiket, params) {
  let raw = "";
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId, serviceid: "MZYCreateContainer",
      args: xml(params), returntype: "JSON", permanent: false,
    });
    const o = val(res?.callIASServiceReturn ?? res);
    raw = typeof o === "string" ? o : JSON.stringify(o ?? "");
  } catch (e) {
    raw = "HATA: " + (e?.message || e).toString().slice(0, 140);
  }

  console.log("─".repeat(74));
  console.log(`  ${etiket}`);
  console.log(`  giden: ${xml(params)}`);

  if (raw.startsWith("HATA")) {
    console.log(`  ${raw}`);
    return;
  }

  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    console.log(`  (JSON değil) ${raw.slice(0, 200)}`);
    return;
  }

  for (const [ad, icerik] of Object.entries(d)) {
    const rows = unwrap(icerik);
    if (!rows.length) {
      console.log(`  ${ad}: (boş)`);
      continue;
    }
    console.log(`  ${ad}: ${rows.length} satır`);
    for (const row of rows) {
      console.log(
        "    " +
          Object.entries(row)
            .map(([k, v]) => `${k}=${v === "" ? "∅" : v}`)
            .join("  ")
      );
    }
  }
}

console.log("═".repeat(74));
console.log("MZYCreateContainer — KEŞİF");
console.log("═".repeat(74));
console.log("Amaç: servis hangi parametreleri zorunlu tutuyor, hata mesajı ne diyor.\n");

// Parametresiz — servis "şu alan eksik" derse parametre adlarını öğreniriz
await dene("01 parametresiz", {});

// Yalnız firma/tesis
await dene("02 sadece firma + tesis", {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
});

// Koddaki mevcut hali — PSMATERIAL="KONPAKET" (TAHMİN, doğrulanmadı)
await dene("03 koddaki hali (PSMATERIAL=KONPAKET)", {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSMATERIAL: "KONPAKET",
});

// Bora'nın Excel'indeki resmi liste: PSCOMPANY 01, PSPLANT 100,
// PSWAREHOUSE 10, PSMATERIAL KONPAKET.  Depo "10" — ayarlardaki D1 değil.
await dene("04 EXCEL'DEKİ RESMİ HALİ (depo 10)", {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
  PSWAREHOUSE: "10", PSMATERIAL: "KONPAKET",
});

// Karşılaştırma: ayarlardaki depo ile
await dene(`05 ayarlardaki depo (${T_WAREHOUSE}) ile`, {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
  PSWAREHOUSE: T_WAREHOUSE, PSMATERIAL: "KONPAKET",
});

if (YAZ) {
  console.log("\n" + "═".repeat(74));
  console.log("⚠ YAZMA DENEMESİ — gerçek konteyner oluşabilir");
  console.log("═".repeat(74));
  await dene("06 emir bilgisiyle (dokümanda yok, fazlalık deneme)", {
    PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
    PSWAREHOUSE: "10", PSMATERIAL: "KONPAKET",
    PSORDERNUM: "26935024", PSORDERTYPE: "SO",
  });
} else {
  console.log("\n" + "─".repeat(74));
  console.log("  (yazma denemesi atlandı — çalıştırmak için: --yaz)");
}

console.log("\n" + "═".repeat(74));
console.log("NE ARIYORUZ");
console.log("═".repeat(74));
console.log("  • Hata mesajı zorunlu parametre adı veriyor mu?");
console.log("  • Dönen tabloda konteyner numarası var mı (CONTAINERNUM gibi)?");
console.log("  • Hepsi aynı cevabı veriyorsa parametreler okunmuyor demektir.");

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
