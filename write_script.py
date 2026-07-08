import os
fpath = "src/tampermonkey/hua-yi-helper.user.js"

content = r"""// ==UserScript==
// @name         TEST HEADER
// @match        *://*.91huayi.com/*
// @grant        none
// ==/UserScript==

var VERSION = "3.1.0-test";
var CFG = { submitTime: 6100, retryTime: 2100, examTime: 10000, randomMax: 5000, speed: 1 };
var KEYS = { playRate: "HY_Rate", right: "HY_Right", courseList: "HY_CList", mode: "HY_Mode" };
var TARGET = { year: 2025, total: 25, pub: 5, other: 20 };

function getPageType() {
    var h = location.href, p = h.split("/"), l = (p[p.length-1]||"").split("?")[0].split("#")[0];
    return { full: h, last: l,
        isVid: l==="course_ware_polyv.aspx"||l==="course_ware_cc.aspx",
        isExam: l==="exam.aspx"||l==="exam_code.aspx",
        isER: l==="exam_result.aspx",
        isSL: l==="study_info_list.aspx",
        isCL: l==="course.aspx"||l==="cme.aspx",
        isCD: l==="course.aspx" && h.indexOf("cid=")>-1,
        isFME: l==="fme.aspx",
        isFace: l==="face.aspx",
        isCI: h.indexOf("/cme/index")>-1
    };
}

var Store = { 
    g:function(k,d){try{var r=localStorage.getItem(k);return r!==null?JSON.parse(r):d}catch(e){return d}},
    s:function(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},
    d:function(k){try{localStorage.removeItem(k)}catch(e){}}
};

function log(m){console.log("[HYv3] "+m);}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}

console.log("TEST WRITE OK");
"""

with open(fpath, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"OK: {os.path.getsize(fpath)} bytes")
