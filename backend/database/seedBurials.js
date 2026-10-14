const pool = require('../config/db');

const records = [
  // Section A: A-01 to A-24
  { full_name: 'Dennis B. Ebon',                grave_reference: 'A-01' },
  { full_name: 'Amparo D. Ebon',                grave_reference: 'A-02' },
  { full_name: 'Bernandino C. Gorro',           grave_reference: 'A-03' },
  { full_name: 'Robarl P. Diangga',             grave_reference: 'A-04' },
  { full_name: 'Lurohama M. Mepieza',           grave_reference: 'A-05' },
  { full_name: 'Susana B. Manago',              grave_reference: 'A-06' },
  { full_name: 'Claire Y. Bantong',             grave_reference: 'A-07' },
  { full_name: 'Florencio T. Jumao-as',         grave_reference: 'A-08' },
  { full_name: 'Luciana M. Antiya',             grave_reference: 'A-09' },
  { full_name: 'Aniceto T. Sablano',            grave_reference: 'A-10' },
  { full_name: 'Leodegario A. Tecson',          grave_reference: 'A-11' },
  { full_name: 'Marjorie Mae J. Pacaldo',       grave_reference: 'A-12' },
  { full_name: 'Antonio Bacus',                 grave_reference: 'A-13' },
  { full_name: 'Marina B. Orito',               grave_reference: 'A-14' },
  { full_name: 'Proceso D. Pogoy',              grave_reference: 'A-15' },
  { full_name: 'Jasmin U. Generalao',           grave_reference: 'A-16' },
  { full_name: 'Efren D. Urot',                 grave_reference: 'A-17' },
  { full_name: 'Gregorio D. Wahing',            grave_reference: 'A-18' },
  { full_name: 'Juliana T. Pogoy',              grave_reference: 'A-19' },
  { full_name: 'Silvestra D. Wahing',           grave_reference: 'A-20' },
  { full_name: 'Romero B. Salera',              grave_reference: 'A-21' },
  { full_name: 'Richard P. Bonghanoy',          grave_reference: 'A-22' },
  { full_name: 'Francisca G. Anzano',           grave_reference: 'A-23' },
  { full_name: 'Joseph Bladelino B. Berido',    grave_reference: 'A-24' },

  // Section B: B-01 to B-24
  { full_name: 'Renaldo A. Damaigo',            grave_reference: 'B-01' },
  { full_name: 'Lavian O. Sebusa',              grave_reference: 'B-02' },
  { full_name: 'Ranilo C. Andales',             grave_reference: 'B-03' },
  { full_name: 'Marites I. Denlauso',           grave_reference: 'B-04' },
  { full_name: 'Francisca A. Tirol',            grave_reference: 'B-05' },
  { full_name: 'Welma T. Ornopia',              grave_reference: 'B-06' },
  { full_name: 'Antonio S. Montecillo',         grave_reference: 'B-07' },
  { full_name: 'Welfrido T. Pogoy',             grave_reference: 'B-08' },
  { full_name: 'Renerio P. Amoren',             grave_reference: 'B-09' },
  { full_name: 'Catherine L. Abad',             grave_reference: 'B-10' },
  { full_name: 'Dolores S. Silawan',            grave_reference: 'B-11' },
  { full_name: 'Esterlita Benigay',             grave_reference: 'B-12' },
  { full_name: 'Cirilo Pungcol Jr.',            grave_reference: 'B-13' },
  { full_name: 'Dominga C. Placencia',          grave_reference: 'B-14' },
  { full_name: 'Leonilo I. Cañete',             grave_reference: 'B-15' },
  { full_name: 'Maximo Guzman Roca Jr.',        grave_reference: 'B-16' },
  { full_name: 'Nathalie Grace P. Reffule',     grave_reference: 'B-17' },
  { full_name: 'Apolonio P. Cañete',            grave_reference: 'B-18' },
  { full_name: 'Avangeline C. Cañete',          grave_reference: 'B-19' },
  { full_name: 'Zayden Jireh B. Dinoy',         grave_reference: 'B-20' },
  { full_name: 'Fujiko P. Ligan',               grave_reference: 'B-21' },
  { full_name: 'Ethan Cullen A. Escabas',       grave_reference: 'B-22' },
  { full_name: 'Rogelio P. Torresjas',          grave_reference: 'B-23' },
  { full_name: 'Esabela Arong Pogoy',           grave_reference: 'B-24' },

  // Section C: C-01 to C-24
  { full_name: 'Circiaca B. Racal',             grave_reference: 'C-01' },
  { full_name: 'Mary Clarie G. Libre',          grave_reference: 'C-02' },
  { full_name: 'James B. Bayta',                grave_reference: 'C-03' },
  { full_name: 'Vicente S. Andales',            grave_reference: 'C-04' },
  { full_name: 'Merlita C. Ylanan',             grave_reference: 'C-05' },
  { full_name: 'Bienvenido Celadis',            grave_reference: 'C-06' },
  { full_name: 'Lareauno C. Abalde',            grave_reference: 'C-07' },
  { full_name: 'Teresita P. Torrejas',          grave_reference: 'C-08' },
  { full_name: 'Sherwin D. Bioco',              grave_reference: 'C-09' },
  { full_name: 'Jenny P. Mativo',               grave_reference: 'C-10' },
  { full_name: 'MaryJane C. Mintalar',          grave_reference: 'C-11' },
  { full_name: 'Federico T. Espinosa',          grave_reference: 'C-12' },
  { full_name: 'Princess Rhiana T. Cañete',     grave_reference: 'C-13' },
  { full_name: 'Antonio C. Wahing',             grave_reference: 'C-14' },
  { full_name: 'Basilisa Maislim Esparcia',     grave_reference: 'C-15' },
  { full_name: 'Juana Miano',                   grave_reference: 'C-16' },
  { full_name: 'Grechen Simangca',              grave_reference: 'C-17' },
  { full_name: 'Alfredo M. Seno',               grave_reference: 'C-18' },
  { full_name: 'Guilermo N. Dinoy',             grave_reference: 'C-19' },
  { full_name: 'Ferdinan I. Escabas',           grave_reference: 'C-20' },
  { full_name: 'Crisanto N. Dinoy',             grave_reference: 'C-21' },
  { full_name: 'Timoteo O. Baguio',             grave_reference: 'C-22' },
  { full_name: 'Antero A. Baguio',              grave_reference: 'C-23' },
  { full_name: 'Lewey T. Deguilmo',             grave_reference: 'C-24' },
];

const main = async () => {
  // Get Cogon Cemetery ID
  const cemRes = await pool.query("SELECT id FROM cemeteries WHERE name = 'Cogon Cemetery' LIMIT 1");
  if (cemRes.rows.length === 0) {
    console.error('ERROR: Cogon Cemetery not found in cemeteries table. Run schema first.');
    return;
  }
  const cemeteryId = cemRes.rows[0].id;
  console.log('Cogon Cemetery ID:', cemeteryId);

  let inserted = 0;
  let skipped = 0;

  for (const rec of records) {
    try {
      // Check if grave_reference already occupied
      const existing = await pool.query(
        'SELECT id FROM burial_records WHERE cemetery_id = $1 AND grave_reference = $2 LIMIT 1',
        [cemeteryId, rec.grave_reference]
      );
      if (existing.rows.length > 0) {
        console.log('SKIP ' + rec.grave_reference + ' — already occupied');
        skipped++;
        continue;
      }

      await pool.query(
        'INSERT INTO burial_records (cemetery_id, full_name, grave_reference) VALUES ($1, $2, $3)',
        [cemeteryId, rec.full_name, rec.grave_reference]
      );
      console.log('OK   ' + rec.grave_reference + ' -> ' + rec.full_name);
      inserted++;
    } catch (err) {
      console.error('ERR  ' + rec.grave_reference + ' -> ' + rec.full_name + ': ' + err.message);
    }
  }

  console.log('\nDone. Inserted: ' + inserted + ' | Skipped: ' + skipped);
};

main()
  .catch((err) => { console.error('Fatal:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
