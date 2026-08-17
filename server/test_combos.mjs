import soap from "soap";

async function run() {
  const c = await soap.createClientAsync('http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl');
  const dbs = ['TEST', 'CANIAS', 'CANIASTEST', 'IAS', 'CANIASTESTDB', 'LIVE', 'PROD'];
  const dbServers = ['CANIAS', '192.168.22.16', 'DEPOERP', 'localhost'];
  const appServers = ['192.168.22.16:27499', '192.168.22.16:27490', '192.168.22.16'];
  const clients = ['00', '01'];
  const users = ['WMSWSUSER', 'wmswsuser', 'WMSUSER'];
  const pwds = ['1WmS00*', '1WMS00*', '1wms00*'];

  for (const pwd of pwds) {
    for (const u of users) {
      for (const db of dbs) {
        for (const dbsrv of dbServers) {
          for (const appsrv of appServers) {
            for (const cl of clients) {
              try {
                const [res] = await c.loginAsync({
                  p_strClient: cl,
                  p_strLanguage: 'T',
                  p_strDBName: db,
                  p_strDBServer: dbsrv,
                  p_strAppServer: appsrv,
                  p_strUserName: u,
                  p_strPassword: pwd
                });
                const sid = res?.loginReturn?.$value ?? (typeof res?.loginReturn === 'string' ? res.loginReturn : '');
                if (sid && sid.length > 0) {
                  console.log('SUCCESS! u:', u, 'pwd:', pwd, 'db:', db, 'dbsrv:', dbsrv, 'appsrv:', appsrv, 'cl:', cl, 'sid:', sid);
                  return;
                }
              } catch(e) {
                // ignore
              }
            }
          }
        }
      }
    }
  }
  console.log('Done testing combinations. None succeeded.');
}

run();
