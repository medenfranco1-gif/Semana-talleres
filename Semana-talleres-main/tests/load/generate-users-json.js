/**
 * Script para generar register-users.json con N usuarios
 *
 * Uso:
 *   node tests/load/generate-users-json.js 100
 */

const fs = require('fs');
const path = require('path');

const count = parseInt(process.argv[2] || '100', 10);

if (count < 1 || count > 200) {
  console.error('❌ Error: Cantidad debe estar entre 1 y 200');
  process.exit(1);
}

const users = [];

for (let i = 1; i <= count; i++) {
  const num = String(i).padStart(2, '0');
  users.push({
    nombre: 'Test',
    apellido: `Alumno${num}`,
    documento: `900000${num}`,
    curso: '5°',
    division: 'A',
    email: `medenfranco1+loadtest${num}@gmail.com`,
    password: 'hola123'
  });
}

const outputPath = path.join(__dirname, 'register-users.json');
fs.writeFileSync(outputPath, JSON.stringify(users, null, 2));

console.log(`✅ Generados ${count} usuarios en: ${outputPath}`);
