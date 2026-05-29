require('dotenv').config();
const m = require('mysql2/promise');
const products = [
  ['Musamam','MAB011-1',35000],
  ['Musamam White Intense','MAB011-2',35000],
  ['YARA','MAB021',15000],
  ['YARA TOUS','MAB021-2',15000],
  ['YARA CANDY','MAB021-5',15000],
  ['YARA MOII','MAB021-3',15000],
  ['ASAD','MAB021-1',15000],
  ['ASAD ZANZIBAR','MAB021-4',15000],
  ['ASAD BOURBON','MAB021-6',15000],
  ['KHAMRAH','MAB047',28000],
  ['KHAMRAH Qahwa','MAB047-1',28000],
  ['KHAMRAH Dukhan','MAB047-2',28000],
  ['YUM YUM','MAB039',35000],
  ['ISLAND BLISS','MAB044',35000],
  ['MARSHMALLOW BLUSH','MAB048',30000],
  ['Ramz Gold','MAB014',20000],
  ['Ramz Sliver','MAB014-1',20000],
  ['His confession','MAB041-1',35000],
  ['Her confession','MAB041-2',35000],
  ['ONE&ONLY 200ML','MAB009-1',40000],
  ['Hudson Valley 200ML','MAB009-2',40000],
  ['CALABRIA 200ML','MAB009-3',40000],
  ['Imperial 200ML','MAB009-4',40000],
  ['PRIVATE GOLD','ZD-010',35000],
  ['MY ROYAL LITE','ZD-011',35000],
  ['NEW WOMEN RAVE','ZD-012',35000],
  ['Fursan','MAB005',18000],
  ['Fursan Unlimited','MAB005-1',18000],
];

(async () => {
  const c = await m.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  for (let i = 0; i < products.length; i++) {
    const [name, code, price] = products[i];
    await c.query('INSERT INTO products (sort_order, code, name, price) VALUES (?,?,?,?)', [i+1, code, name, price]);
  }
  console.log('Imported ' + products.length + ' products');
  await c.end();
})();
