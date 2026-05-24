const { discoverDimensions, loadConfig } = require("../src/configStore");
const fs = require("fs");
const path = require("path");

const config = loadConfig();
const dimensions = discoverDimensions(config);

const cacheFile = path.join(__dirname, "..", "..", "..", "dimensions_seed.json");
fs.writeFileSync(cacheFile, JSON.stringify({ dimensions, seed: true }), "utf8");
console.log(`Seed cache written: ${cacheFile} (${dimensions.length} dimensions)`);
