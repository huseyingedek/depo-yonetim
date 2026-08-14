async function testPingProxy() {
  try {
    const res = await fetch("http://localhost:8787/api/mzy/MZYCheckUser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PSUSER: "WMSWSUSER", PSPASSWORD: "1WmS00*" })
    });
    console.log("Proxy response status:", res.status);
    console.log("Proxy body:", await res.json());
  } catch (err) {
    console.error("Proxy fetch failed:", err.message);
  }
}

testPingProxy();
