import soap from "soap";

async function testCallSetMatSize() {
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

    const sessionId = loginRes?.loginReturn?.$value ?? (typeof loginRes?.loginReturn === "string" ? loginRes.loginReturn : "");
    console.log("Logged in with extracted string sessionId:", sessionId);

    const args = `<PARAMETERS><COMPANY>01</COMPANY><MATERIAL>800980</MATERIAL><VOLUME>0.05</VOLUME><VUNIT>M3</VUNIT><PWIDTH>20</PWIDTH><PLENGTH>30</PLENGTH><PHEIGHT>15</PHEIGHT><NETWEIGHT>1.5</NETWEIGHT><NWUNIT>KG</NWUNIT><BRUTWEIGHT>1.8</BRUTWEIGHT><BWUNIT>KG</BWUNIT><ISEXPLOS>0</ISEXPLOS><ISSPOIL>0</ISSPOIL><AKLISBREAKABLE>0</AKLISBREAKABLE><AKLISLIQUID>0</AKLISLIQUID><AKLISTOXIC>0</AKLISTOXIC><AKLPALPOS>1</AKLPALPOS></PARAMETERS>`;

    console.log("Calling MzySetMatSize with args:", args);
    const [callRes] = await client.callIASServiceAsync({
      sessionid: sessionId,
      serviceid: "MzySetMatSize",
      args,
      returntype: "JSON",
      permanent: false,
    });

    console.log("Raw Call Response:", JSON.stringify(callRes, null, 2));
  } catch (err) {
    console.error("Test Error:", err.message);
  }
}

testCallSetMatSize();
