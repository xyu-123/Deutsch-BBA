// vocab_numbers.js
(function () {
  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/\p{Cf}/gu, "")
      .replace(/[\p{Z}\t\r\n\f]+/gu, " ")
      .trim();
  }

  const UNITS = [
    "", "eins", "zwei", "drei", "vier",
    "fünf", "sechs", "sieben", "acht", "neun"
  ];

  const TEENS = {
    10: "zehn",
    11: "elf",
    12: "zwölf",
    13: "dreizehn",
    14: "vierzehn",
    15: "fünfzehn",
    16: "sechzehn",  // sechs → sechzehn
    17: "siebzehn",  // sieben → siebzehn
    18: "achtzehn",
    19: "neunzehn",
  };

  const TENS = {
    20: "zwanzig",
    30: "dreißig",
    40: "vierzig",
    50: "fünfzig",
    60: "sechzig",   // sechs → sechzig
    70: "siebzig",   // sieben → siebzig
    80: "achtzig",
    90: "neunzig",
  };

  function twoDigitsToWord(n) {
    if (n < 10) return UNITS[n];
    if (n >= 10 && n < 20) return TEENS[n];
    const tens = Math.floor(n / 10) * 10;
    const unit = n % 10;
    if (unit === 0) return TENS[tens];
    // 21, 22 ...: "einundzwanzig"（注意 1 用 "ein" 而不是 "eins"）
    const unitWord = (unit === 1) ? "ein" : UNITS[unit];
    return `${unitWord}und${TENS[tens]}`;
  }

  function numberToGerman(n) {
    if (n === 1000) return "tausend"; // 常用作「tausend」，也接受 "eintausend" 當替代
    if (n === 0) return "null";       // 若需要 0
    if (n < 100) return twoDigitsToWord(n);

    const hundreds = Math.floor(n / 100);
    const rest = n % 100;

    let hundredWord = (hundreds === 1) ? "einhundert" : `${UNITS[hundreds]}hundert`;
    if (rest === 0) return hundredWord;
    return `${hundredWord}${twoDigitsToWord(rest)}`;
  }

  // 產生 1～1000 題
  const list = [];
  for (let i = 1; i <= 1000; i++) {
    const main = numberToGerman(i);

    // 可接受的替代答案（同義異形）
    const alt = [];
    // 阿拉伯數字本體
    alt.push(String(i));

    // 100 / 1000 的替代常見型
    if (i === 100) alt.push("hundert");        // 等同 "einhundert"
    if (i === 1000) alt.push("eintausend");    // 等同 "tausend"

    list.push({
      type: "number",
      number: i,
      deutsch: main,         // 主答案：德文字
      alt,                   // 替代答案清單（包含阿拉伯數字）
      chinese: `數字 ${i}`,
      lesson: "Numbers",
    });
  }

  window.vocabNumbers = list;
})();
