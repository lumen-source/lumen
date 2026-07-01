import fs from 'node:fs';

const watPath = '../seed/lumenc.wat';
let wat = fs.readFileSync(watPath, 'utf8');

// Replace memory export limit 9 -> 100 pages
wat = wat.replace('(memory (export "mem") 9)', '(memory (export "mem") 100)');

const shifts = {
  20000: 100000,
  30000: 150000,
  126000: 246000,
  127000: 247000,
  127500: 247500,
  128000: 248000,
  128010: 248010,
  128020: 248020,
  128030: 248030,
  128040: 248040,
  128050: 248050,
  128060: 248060,
  128070: 248070,
  128080: 248080,
  128100: 248100,
  128120: 248120,
  128140: 248140,
  128150: 248150,
  128160: 248160,
  128170: 248170,
  128180: 248180,
  128190: 248190,
  128200: 248200,
  128210: 248210,
  128220: 248220,
  128230: 248230,
  128240: 248240,
  128250: 248250,
  128260: 248260,
  128270: 248270,
  128280: 248280,
  128290: 248290,
  128300: 248300,
  128310: 248310,
  128320: 248320,
  128330: 248330,
  128340: 248340,
  128350: 248350,
  128360: 248360,
  128370: 248370,
  128380: 248380,
  128390: 248390,
  128400: 248400,
  129000: 249000,
  166000: 286000,
  176000: 296000,
};

wat = wat.replace(/\(i32\.const (\d+)\)/g, (match, p1) => {
  const val = parseInt(p1, 10);
  if (shifts[val] !== undefined) {
    return `(i32.const ${shifts[val]})`;
  }
  return match;
});

// Also update memory map documentation comments in wat for clarity
wat = wat.replace('[20000 .. 30000)  SRC', '[100000 .. 150000) SRC');
wat = wat.replace('[30000 .. 126000) TOKENS', '[150000 .. 246000) TOKENS');
wat = wat.replace('index 7998 ends at 125988 < SYMBOLS@126000', 'index 7998 ends at 245976 < SYMBOLS@246000');
wat = wat.replace('[126000 .. 127000) SYMBOLS', '[246000 .. 247000) SYMBOLS');
wat = wat.replace('[127000 .. 127500) PARAMS', '[247000 .. 247500) PARAMS');
wat = wat.replace('[127500 .. 128000) LOCALS', '[247500 .. 248000) LOCALS');
wat = wat.replace('[128000 .. 128400] keyword literals', '[248000 .. 248400] keyword literals');
wat = wat.replace('[129000 .. 166000) call-target FIXUPS', '[249000 .. 286000) call-target FIXUPS');
wat = wat.replace('[166000 .. 176000) DIAG', '[286000 .. 296000) DIAG');
wat = wat.replace('[176000 .. )      HEAP', '[296000 .. )      HEAP');
wat = wat.replace('[11328 .. 20000)  CODE', '[11328 .. 100000) CODE');

fs.writeFileSync(watPath, wat, 'utf8');
console.log('Successfully patched seed/lumenc.wat memory bounds!');
