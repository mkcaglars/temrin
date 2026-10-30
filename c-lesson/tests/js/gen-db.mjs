// Veritabanı şablonundan proje üretir (C# testleri derleyip çalıştırır).
// Kullanım: node tests/js/gen-db.mjs > cikti.json
import { TEMPLATES } from '../../web/assets/js/templates.js';
import { databaseXml, dataFileName } from '../../web/assets/js/datasetgen.js';

const data = TEMPLATES.find((t) => t.id === 'veritabani').create('OkulUygulamasi');
process.stdout.write(JSON.stringify({
  name: 'Okul Uygulaması', namespace: data.namespace,
  files: data.files.map((f) => ({ name: f.name, content: f.content })),
  dataFiles: [{ name: dataFileName(data.database), content: databaseXml(data.database) }],
}));
