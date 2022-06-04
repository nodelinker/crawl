const puppeteer = require('puppeteer');
const { intercept, patterns } = require('puppeteer-interceptor');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isEmpty(value) {
    return typeof value == 'string' && !value.trim() || typeof value == 'undefined' || value === null;
}

// get url parms dict
function getUrlParams(search) {
    if (search.isEmpty || search == '') {
        return {};
    }
    let hashes = search.slice(search.indexOf('?') + 1).split('&')
    return hashes.reduce((params, hash) => {
        let [key, val] = hash.split('=')
        return Object.assign(params, { [key]: decodeURIComponent(val) })
    }, {})
}

(async () => {

    let url = new URL("https://www.google.com/search?q=javascript+es6++code+pad&newwindow=1&ei=yvyaYqWOFdubseMPm4adoA8&ved=0ahUKEwilm5relpP4AhXbTWwGHRtDB_QQ4dUDCA8&uact=5&oq=javascript+es6++code+pad&gs_lcp=Cgdnd3Mtd2l6EAM6BwgAEEcQsAM6BAgAEA06BggAEB4QDToICAAQHhAIEA1KBAhBGABKBAhGGABQ8AtY2Shg-yloD3ABeAOAAfIBiAG6DpIBBTAuNy4zmAEAoAEByAEIwAEB&sclient=gws-wiz");
    let url_origin = url.origin
    let url_params = getUrlParams(url.search);

    // 检查数据类型
    var intRe = /^\d+$/;
    var floatRe = /^\d+\.\d+$/;
    var boolRe = /^(true|false)$/;
    var strRe = /^[\w\W]+$/;

    for (const [key, value] of Object.entries(url_params)) {
        
        if (intRe.test(value)) {
            let value = `${key}={int}`;
        } else if (floatRe.test(value)) {
            let value = `${key}={float}`;
        } else if (boolRe.test(value)) {
            let value = `${key}={bool}`;
        } else if (strRe.test(value)) {
            let value = `${key}={str}`;
        } else {
            let value = `${key}={unkonwn}`;
        }
    }

})();