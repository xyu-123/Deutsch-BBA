// 若某類別檔案暫時沒載入，也不會爆掉
const _n = Array.isArray(window.vocabNouns) ? window.vocabNouns : [];
const _v = Array.isArray(window.vocabVerbs) ? window.vocabVerbs : [];
const _o = Array.isArray(window.vocabOther) ? window.vocabOther : [];
const _s = Array.isArray(window.vocabSec) ? window.vocabSec : [];
const _num = Array.isArray(window.vocabNumbers) ? window.vocabNumbers : [];

// 合併成你主程式期望的名稱 vocabList
window.vocabList = [..._n, ..._v, ..._o,..._s,..._num];