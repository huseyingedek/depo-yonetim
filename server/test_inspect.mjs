import soap from "soap";

async function testInspectLogin() {
  const url = "http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl";
  try {
    const client = await soap.createClientAsync(url, { timeout: 15000 });
    const [loginRes] = await client.loginAsync({
      p_strClient: "00",
      p_strLanguage: "T",
      p_strDBName: "TEST",
      p_strDBServer: "CANIAS",
      p_strAppServer: "192.168.22.16:27499",
      p_strUserName: "WMSWSUSER",
      p_strPassword: "1WmS00*"
    });

    console.log("loginRes Type:", typeof loginRes);
    console.log("loginRes JSON:", JSON.stringify(loginRes, null, 2));
    console.log("loginReturn Type:", typeof loginRes?.loginReturn);
    console.log("loginReturn Val:", loginRes?.loginReturn);
  } catch (err) {
    console.error("Test Error:", err.message);
  }
}

testInspectLogin();
