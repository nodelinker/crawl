const puppeteer = require("puppeteer");
const { intercept, patterns } = require("puppeteer-interceptor");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEmpty(value) {
  return (
    (typeof value == "string" && !value.trim()) ||
    typeof value == "undefined" ||
    value === null
  );
}

// get url parms dict
function getUrlParams(search) {
  if (search.isEmpty || search == "") {
    return {};
  }
  let hashes = search.slice(search.indexOf("?") + 1).split("&");
  return hashes.reduce((params, hash) => {
    let [key, val] = hash.split("=");
    return Object.assign(params, { [key]: decodeURIComponent(val) });
  }, {});
}

function generateUrlPattern(url) {
  let _url = new URL(url);
  let urlParams = getUrlParams(_url.search);
  let urlParamsPattern = [];

  // 检查数据类型
  var intRe = /^\d+$/;
  var floatRe = /^\d+\.\d+$/;
  var boolRe = /^(true|false)$/;
  var strRe = /^[\w\W]+$/;

  for (const [key, value] of Object.entries(urlParams)) {
    if (intRe.test(value)) {
      urlParamsPattern.push(`${key}={int}`);
    } else if (floatRe.test(value)) {
      urlParamsPattern.push(`${key}={float}`);
    } else if (boolRe.test(value)) {
      urlParamsPattern.push(`${key}={bool}`);
    } else if (strRe.test(value)) {
      urlParamsPattern.push(`${key}={str}`);
    } else {
      urlParamsPattern.push(`${key}={unkonwn}`);
    }
  }

  let urlSearchPattern = urlParamsPattern.join("&");
  _url.search = urlSearchPattern;

  return _url.href;
}

(async () => {
  let duplicateCheckUrls = new Set();

  let urlPattern = generateUrlPattern(
    "https://www.google.com/search?q=javascript+es6++code+pad&newwindow=1&ei=yvyaYqWOFdubseMPm4adoA8&ved=0ahUKEwilm5relpP4AhXbTWwGHRtDB_QQ4dUDCA8&uact=5&oq=javascript+es6++code+pad&gs_lcp=Cgdnd3Mtd2l6EAM6BwgAEEcQsAM6BAgAEA06BggAEB4QDToICAAQHhAIEA1KBAhBGABKBAhGGABQ8AtY2Shg-yloD3ABeAOAAfIBiAG6DpIBBTAuNy4zmAEAoAEByAEIwAEB&sclient=gws-wiz"
  );
  console.log(urlPattern);
})();
