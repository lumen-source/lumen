import fs from "fs";
let src = fs.readFileSync("emit_fn_orig.lm", "utf8");
// remove comments
src = src.replace(/#[^\n]*/g, "");
// minifier that preserves string contents and doesn't squish keywords
let out = "";
let inStr = false;
let lastChar = "";
for(let i = 0; i < src.length; i++) {
  if (src[i] === '"') inStr = !inStr;
  if (!inStr) {
    if (src[i] === ' ' || src[i] === '\t' || src[i] === '\n') {
      let isAlnum = /[A-Za-z0-9_]/.test(lastChar);
      let nextIsAlnum = false;
      for (let j = i+1; j < src.length; j++) {
        if (src[j] !== ' ' && src[j] !== '\t' && src[j] !== '\n') {
           nextIsAlnum = /[A-Za-z0-9_]/.test(src[j]);
           break;
        }
      }
      if (isAlnum && nextIsAlnum) {
         if (out.length > 0 && out[out.length-1] !== ' ') out += ' ';
         lastChar = ' ';
      }
      continue;
    }
  }
  out += src[i];
  lastChar = src[i];
}
fs.writeFileSync("emit_fn.lm", out);
