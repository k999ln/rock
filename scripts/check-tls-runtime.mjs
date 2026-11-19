const minimumByMajor = new Map([
  [22, [22, 23, 4]],
  [24, [24, 22, 1]],
  [26, [26, 12, 1]],
]);

const current = process.versions.node.split('.').map(Number);
const minimum = minimumByMajor.get(current[0]);
let comparison = 0;
if (minimum) {
  for (let index = 0; index < 3; index += 1) {
    if (current[index] !== minimum[index]) {
      comparison = Math.sign(current[index] - minimum[index]);
      break;
    }
  }
}

if (!minimum || comparison < 0) {
  console.error(`Unsupported Node TLS runtime ${process.versions.node}. Use Node >=22.23.4 <23, >=24.22.1 <25, or >=26.12.1 <27.`);
  process.exit(1);
}

console.log(`Node TLS runtime ${process.versions.node} meets the eMudhra certificate-blocking release floor.`);
