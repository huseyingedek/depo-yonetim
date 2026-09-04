import soap from "soap";

async function test() {
  const client = await soap.createClientAsync('http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl', { timeout: 15000 });
  const [loginRes] = await client.loginAsync({
    p_strClient: '00', p_strLanguage: 'T', p_strDBName: 'TEST',
    p_strDBServer: 'CANIAS', p_strAppServer: '192.168.22.16:27499',
    p_strUserName: 'WMSWSUSER', p_strPassword: '1WmS00*'
  });
  const sid = loginRes?.loginReturn?.['$value'] ?? loginRes?.loginReturn;
  console.log('Session ID:', sid);

  const testCases = [
    { service: 'MzyGetCustomer', args: '<PARAMETERS><PSCOMPANY>01</PSCOMPANY></PARAMETERS>' },
    { service: 'MZYGetCustomer', args: '<PARAMETERS><PSCOMPANY>01</PSCOMPANY></PARAMETERS>' },
    { service: 'MzyGetCustomer', args: '<PARAMETERS><PSCOMPANY>01</PSCOMPANY><PSCUSTOMER>16660</PSCUSTOMER></PARAMETERS>' },
    { service: 'MzyGetCustomer', args: '<PARAMETERS><PSCOMPANY>01</PSCOMPANY><PSCUSTOMER>800980</PSCUSTOMER></PARAMETERS>' },
    { service: 'MzyGetCustomer', args: '<PARAMETERS><PSCOMPANY>01</PSCOMPANY><PSCUSNAME1>%</PSCUSNAME1></PARAMETERS>' },
    { service: 'MzyGetCustomer', args: '<PARAMETERS><COMPANY>01</COMPANY><CUSTOMER>16660</CUSTOMER></PARAMETERS>' },
    { service: 'MzyGetCustomer', args: '<PARAMETERS><PSCOMPANY>01</PSCOMPANY><PSCUSTOMER>16660</PSCUSTOMER><PICUSTYPE>0</PICUSTYPE></PARAMETERS>' },
    { service: 'MzyGetCustomer', args: '<PARAMETERS><PSCOMPANY>01</PSCOMPANY><PSCUSTOMER>16660</PSCUSTOMER><PICUSTYPE>1</PICUSTYPE></PARAMETERS>' },
    { service: 'MzyGetCustomer', args: '<PARAMETERS><PSCOMPANY>01</PSCOMPANY><PSCUSTOMER>16660</PSCUSTOMER><PICUSTYPE>2</PICUSTYPE></PARAMETERS>' },
    { service: 'MzyGetCustomer', args: '<PARAMETERS><PSCOMPANY>01</PSCOMPANY><PSCUSTOMER>16660</PSCUSTOMER><PSCUSTYPE>1</PSCUSTYPE></PARAMETERS>' },
  ];

  for (const tc of testCases) {
    try {
      const [callRes] = await client.callIASServiceAsync({
        sessionid: sid,
        serviceid: tc.service,
        args: tc.args,
        returntype: 'JSON',
        permanent: false
      });
      console.log(`[${tc.service}] ${tc.args} ->`, JSON.stringify(callRes?.callIASServiceReturn).slice(0, 200));
    } catch (e) {
      console.log(`[${tc.service}] ${tc.args} Error:`, e.message);
    }
  }
}

test().catch(console.error);
