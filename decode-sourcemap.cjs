const fs = require('fs');
const path = require('path');
const sourceMap = require('source-map');

async function locate() {
  const mapPath = path.join(__dirname, 'dist', 'assets', 'index-DYzmbkte.js.map');
  const rawSourceMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

  const consumer = await new sourceMap.SourceMapConsumer(rawSourceMap);

  const pos = consumer.originalPositionFor({
    line: 68,
    column: 1577
  });

  console.log('Position for 68:1577 =>', pos);
  consumer.destroy();
}

locate().catch(console.error);
