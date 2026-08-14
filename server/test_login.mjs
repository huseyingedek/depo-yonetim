import soap from "soap";

async function testDirectLogin() {
  const url = "http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl";
  console.log("Connecting to SOAP WSDL:", url);
  try {
    const client = await soap.createClientAsync(url, { timeout: 15000 });
    console.log("Client created. Attempting login...");
    const [res] = await client.loginAsync({
      p_strClient: "00",
      p_strLanguage: "T",
      p_strDBName: "TEST",
      p_strDBServer: "CANIAS",
      p_strAppServer: "192.168.22.16:27499",
      p_strUserName: "WMSWSUSER",
      p_strPassword: "1WmS00*"
    });

    console.log("Login Response Raw:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("Direct Login Error:", err.message);
  }
}

testDirectLogin();
