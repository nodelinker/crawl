const puppeteer = require("puppeteer");
const { intercept, patterns } = require("puppeteer-interceptor");
const { Cluster } = require("puppeteer-cluster");
const fs = require("fs");
const { URL } = require("url");
const winston = require("winston");
const { BloomFilter } = require("bloom-filters");
const yargs = require("yargs");
const { option } = require("yargs");
const { default: cluster } = require("cluster");

const logLevels = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

// 动态参数查询过滤
let duplicateDynamicUrls = new Set();

// 布隆过滤器
// calculated size of the Bloom filter.
// This is where your size / probability trade-offs are made
// http://hur.st/bloomfilter?n=100000&p=1.0E-6
// 2875518 ~350kb

let globalBloomFilter = new BloomFilter(2875518, 10);

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.printf(
      (info) =>
        `${info.timestamp} ${info.level}: ${info.message}` +
        (info.splat !== undefined ? `${info.splat}` : " ")
    )
  ),
  // format: winston.format.simple(),
  // defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

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

// check url has paramters
function hasUrlParams(url) {
  return url.indexOf("?") > 0;
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
  return urlSearchPattern;
}

// add url too queue 包含了去重功能
async function addUrlToClusterQueue(cluster, url) {
  // 如果是动态参数查询, 加入简化后加入过滤器
  if (hasUrlParams(url)) {
    let dynUrlPattern = generateUrlPattern(url);
    // if (duplicateDynamicUrls.has(dynUrlPattern)) {
    //   return;
    // }else{
    //   duplicateDynamicUrls.add(dynUrlPattern);
    // }

    if (globalBloomFilter.has(dynUrlPattern)) {
      return;
    } else {
      globalBloomFilter.add(dynUrlPattern);
    }
  } else {
    // if (duplicateDynamicUrls.has(url)) {
    //   return;
    // }else{
    //   duplicateDynamicUrls.add(url);
    // }

    if (globalBloomFilter.has(url)) {
      return;
    } else {
      globalBloomFilter.add(url);
    }
  }

  await cluster.queue(url);
}

function log4Request(
  url,
  method = "GET",
  headers = null,
  cookies = null,
  body = null
) {
  let json = JSON.stringify({
    url: url,
    method: method,
    headers: headers,
    cookies: cookies,
    body: body,
  });
  fs.appendFile("save-request-json.txt", json + "\n", function (err) {
    if (err) throw err;
    console.log(json);
  });
}

// parse arguments
const options = yargs
  .usage("Usage: -n <name>")
  .option("l", {
    alias: "url",
    describe: "Web url",
    type: "string",
    demandOption: true,
    default: "http://121.196.32.153:8080/WebGoat/login",
  })
  .option("u", {
    alias: "user",
    describe: "Webgoat user",
    type: "string",
    demandOption: true,
    default: "nodenode",
  })
  .option("p", {
    alias: "password",
    describe: "Webgoat password",
    type: "string",
    demandOption: true,
    default: "123123",
  }).argv;

(async () => {
  // let targetUrl = new URL("http://127.0.0.1:8080/WebGoat/attack");
  // let targetUrl = new URL("http://172.29.16.100:8080/WebGoat/attack");

  var targetUrl = new URL(options.url);

  let targetScope = targetUrl.host;

  const launchOptions = {
    headless: true,
    ignoreHTTPSErrors: true, // 忽略证书错误
    waitUntil: "networkidle2",
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
    args: [
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-xss-auditor", // 关闭 XSS Auditor
      "--no-zygote",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--allow-running-insecure-content", // 允许不安全内容
      "--disable-webgl",
      "--disable-popup-blocking",
      //'--proxy-server=http://127.0.0.1:8080'      // 配置代理
    ],
  };

  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    puppeteerOptions: launchOptions,
  });

  // 初始化cluster
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 2,
    // browser: browser,
    skipDuplicateUrls: true,
    puppeteerOptions: launchOptions,
  });



  await cluster.task(async ({ page, data: url }) => {
    var status = null;

    let currentScope = "";
    try {
      let _url = new URL(url);
      currentScope = _url.host;
    } catch (error) {
      console.log("cluster error => ", url);
      return;
    }

    // 判断是否为当前任务领空
    if (currentScope !== targetScope) {
      return;
    }

    // 判断是否为注销页面
    let isLogout = url.toLowerCase().includes("logout");
    if (isLogout == true) {
      return;
    }

    if (fs.existsSync("scope-cookie.json")) {
      const cookiesString = fs.readFileSync("scope-cookie.json", "utf8");
      const cookies = JSON.parse(cookiesString);
      // await page.setCookie(...cookies);
      await page.setCookie.apply(page, cookies);
    }



    try {

      // intercept(page, patterns.XHR("*"), {
      //   onInterception: (event) => {

      //     // console.log(`${event.request.url} ${event.request.method} intercepted.`);
      //     // logger.info(`${event.request.url} ${event.request.method} intercepted.`);

      //     addUrlToClusterQueue(cluster, url);

      //     // try {
      //     //   let url = event.request.url;
      //     //   let method = event.request.method;
      //     //   let headers = event.request.headers;
      //     //   let body = event.request.postData ?? null;
      //     //   let cookies = page.cookies();
  
      //     //   log4Request(url, method, headers, cookies, body);
            
      //     //   addUrlToClusterQueue(cluster, url);
      //     // } catch (error) {
      //     //   console.log(error);
      //     // }
      //   },
      // });
      
      // 这是个错误示范，保留
      // intercept(page, patterns.XHR("*"), {
      //   onInterception: (event) => async (response) => {
      //     console.log(`${event.request.url} ${event.request.method} intercepted.`);
      //     // logger.info(`${event.request.url} ${event.request.method} intercepted.`);
  
      //     try {
      //       let url = event.request.url;
      //       let method = event.request.method;
      //       let headers = event.request.headers;
      //       let body = event.request.body;
      //       let cookies = await page.cookies();
  
      //       // await cluster.queue(url);
      //       log4Request(url, method, headers, cookies, body);
  
      //       await addUrlToClusterQueue(cluster, url);
      //     } catch (error) {
      //       console.log(error);
      //     }
      //   },
      // });


      status = await page.goto(url, {
        waitUntil: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
        timeout: 1000 * 60,
      });
      if (status.ok == false) {
        console.log(` cluster error => ${url} status not ok!`);
        return;
      }

      let method = status.request().method();
      let headers = status.request().headers();
      let body = status.request().postData() ?? null;

      let cookies = await page.cookies();
      log4Request(url, method, headers, cookies, body);
    } catch (error) {
      console.log(`${Date()} cluster error => ${url} ${error}`);
      return;
    }

    intercept(page, patterns.XHR("*"), {
      onInterception: (event) => {

        console.log(`${event.request.url} ${event.request.method} intercepted.`);
        // logger.info(`${event.request.url} ${event.request.method} intercepted.`);

        addUrlToClusterQueue(cluster, url);
      },
    });

    // var tryCount = 0;
    // var trySuccess = false;
    // do {
    //   try {
    //     await page.goto(url, {
    //       waitUntil: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
    //       // [Puppeteer]「TimeoutError: Navigation timeout of 30000 ms exceeded」の解決方法
    //       timeout: 0,
    //     });
    //     trySuccess = true;
    //   } catch (error) {
    //     console.log(`${Date()} cluster error => ${url} ${error}`);
    //     tryCount += 1;
    //     await sleep(1000);
    //   }
    //   if (tryCount > 3) {
    //     return ;
    //   }
    // } while (!trySuccess);

    console.log("================> task: ", url);
    logger.info(` ${url}`);

    let a_tag_links = await page.evaluate(() => {
      let elements = Array.from(document.querySelectorAll("a"));
      let links = elements.map((element) => {
        return element.href;
      });
      return links;
    });

    // filter out the links that are not in the target scope
    // filter duplicated links
    for (var i = 0; i < a_tag_links.length; i++) {
      let tag = a_tag_links[i];
      // console.log("cluster url: ", tag);
      if (!tag.trim()) {
        continue;
      }
      // await cluster.queue(tag);
      let url = tag;
      await addUrlToClusterQueue(cluster, url);
    }

    // 关闭弹窗
    page.on("dialog", async (dialog) => {
      await dialog.dismiss();
    });

    // init javascript env
    await page.evaluate(() => {
      window.sleep = function (time) {
        return new Promise((resolve) => setTimeout(resolve, time));
      };

      // hook setInterval 时间设置为60秒 目的是减轻chrome的压力
      window.__originalSetInterval = window.setInterval;
      window.setInterval = function () {
        arguments[1] = 60000;
        return window.__originalSetInterval.apply(this, arguments);
      };
      Object.defineProperty(window, "setInterval", {
        writable: false,
        configurable: false,
      });
    });

    // dom0 trigger
    await page.evaluate(() => {
      (async function trigger_all_inline_event() {
        let eventNames = [
          "onabort",
          "onblur",
          "onchange",
          "onclick",
          "ondblclick",
          "onerror",
          "onfocus",
          "onkeydown",
          "onkeypress",
          "onkeyup",
          "onload",
          "onmousedown",
          "onmousemove",
          "onmouseout",
          "onmouseover",
          "onmouseup",
          "onreset",
          "onresize",
          "onselect",
          "onsubmit",
          "onunload",
        ];
        for (let eventName of eventNames) {
          let event = eventName.replace("on", "");
          let nodeList = document.querySelectorAll("[" + eventName + "]");
          if (nodeList.length > 100) {
            nodeList = nodeList.slice(0, 100);
          }
          for (let node of nodeList) {
            await window.sleep(1000);
            let evt = document.createEvent("CustomEvent");
            evt.initCustomEvent(event, false, true, null);
            try {
              node.dispatchEvent(evt);
            } catch (e) {
              console.error(e);
            }
          }
        }
      })();
    });

    // dom2 triger
    await page.evaluate(() => {
      function transmit_child(node, event, loop) {
        let _loop = loop + 1;
        if (_loop > 4) {
          return;
        }
        if (node.nodeType === 1) {
          if (node.hasChildNodes) {
            let index = parseInt(Math.random() * node.children.length, 10);
            try {
              node.children[index].dispatchEvent(event);
            } catch (e) {}
            let max = node.children.length > 5 ? 5 : node.children.length;
            for (let count = 0; count < max; count++) {
              let index = parseInt(Math.random() * node.children.length, 10);
              transmit_child(node.children[index], event, _loop);
            }
          }
        }
      }

      // hook dom2 级事件监听
      window.add_even_listener_count_sec_auto = {};
      // record event func , hook addEventListener
      let old_event_handle = Element.prototype.addEventListener;
      Element.prototype.addEventListener = function (
        event_name,
        event_func,
        useCapture
      ) {
        let name =
          "<" +
          this.tagName +
          "> " +
          this.id +
          this.name +
          this.getAttribute("class") +
          "|" +
          event_name;

        // 对每个事件设定最大的添加次数，防止无限触发，最大次数为5
        if (!window.add_even_listener_count_sec_auto.hasOwnProperty(name)) {
          window.add_even_listener_count_sec_auto[name] = 1;
        } else {
          window.add_even_listener_count_sec_auto[name] += 1;
        }

        if (window.add_even_listener_count_sec_auto[name] < 5) {
          let evt = document.createEvent("CustomEvent");
          evt.initCustomEvent(event_name, true, true, null);

          if (
            event_name == "click" ||
            event_name == "focus" ||
            event_name == "mouseover" ||
            event_name == "select"
          ) {
            transmit_child(this, evt, 0);
          }
          if (
            (this.className && this.className.includes("close")) ||
            (this.id && this.id.includes("close"))
          ) {
            return;
          }

          try {
            this.dispatchEvent(evt);
          } catch (e) {
            console.error(e);
          }
        } else {
          return;
        }

        old_event_handle.apply(this, arguments);
      };
    });

    // inline trigger
    await page.evaluate(() => {
      (async function click_all_a_tag_javascript() {
        let nodeListHref = document.querySelectorAll("[href]");
        for (let node of nodeListHref) {
          let attrValue = node.getAttribute("href");
          if (attrValue.toLocaleLowerCase().startsWith("javascript:")) {
            await window.sleep(100);
            try {
              eval(attrValue.substring(11));
            } catch (e) {
              console.error(e);
            }
          }
        }
        let nodeListSrc = document.querySelectorAll("[src]");
        for (let node of nodeListSrc) {
          let attrValue = node.getAttribute("src");
          if (attrValue.toLocaleLowerCase().startsWith("javascript:")) {
            await window.sleep(100);
            try {
              eval(attrValue.substring(11));
            } catch (e) {
              console.error(e);
            }
          }
        }
      })();
    });

    // fill form
    await page.evaluate(() => {
      (async function fill_all_form() {
        // 填充表单
        let nodeList = document.querySelectorAll("form");
        for (let node of nodeList) {
          let inputs = node.querySelectorAll("input");
          for (let input of inputs) {
            switch (input.type) {
              case "":
                input.value = "test";
                break;
              case "text":
                input.value = "test";
                break;
              case "email":
                input.value = "test@test.com";
                break;
              case "password":
                input.value = "test";
                break;
              case "tel":
                input.value = "12345678901";
                break;
              case "radio":
                input.checked = true;
                break;
              case "checkbox":
                input.checked = true;
                break;
              case "submit":
                break;
              case "reset":
                break;
              case "hidden":
                input.value = "test";
                break;
              case "file":
                break;
              case "image":
                break;
              default:
                break;
            }
          }
        }

        // 设置 textarea
        let nodeListTextarea = document.querySelectorAll("textarea");
        for (let node of nodeListTextarea) {
        }

        // 设置 select
        let nodeListSelect = document.querySelectorAll("select");
        for (let node of nodeListSelect) {
        }

        // 提交表单
        let nodeListSubmit = document.querySelectorAll("[type=submit]");
        for (let node of nodeListSubmit) {
          await window.sleep(100);
          try {
            node.click();
          } catch (e) {
            console.error(e);
          }
        }

        await window.sleep(10000);
      })();
    });

    await sleep(3000);
    // await page.waitForTimeout(3000);

  });

  const page = await browser.newPage();
  let status = await page.goto(targetUrl.href, {
    waitUntil: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
  });

  // intercept(page, patterns.All('*'), {
  //   onInterception: event => {
  //     console.log(`${event.request.url} intercepted.`)
  //   },
  //   // onResponseReceived: event => {
  //   //   console.log(`${event.request.url} intercepted, going to modify`)
  //   //   event.response.body += `\n;console.log("This script was modified inline");`
  //   //   return event.response;
  //   // }
  // });

  // await page.type("input[name=username]", "nodenode", { delay: 20 });
  // await page.type("input[name=password]", "123123", { delay: 20 });
  await page.type("input[name=username]", options.user, { delay: 20 });
  await page.type("input[name=password]", options.password, { delay: 20 });
  await page.click("button[type=submit]");

  // wait for sec
  await sleep(1000);

  // login success save cookie
  const cookies = await page.cookies();
  console.info("cookies are ", cookies);

  fs.writeFile(
    "scope-cookie.json",
    JSON.stringify(cookies, null, 2),
    function (err) {
      if (err) throw err;
      console.log("completed write of cookies");
    }
  );

  // 关闭弹窗
  page.on("dialog", async (dialog) => {
    await dialog.dismiss();
  });

  // find a[href]
  let a_tag_links = await page.evaluate(() => {
    let elements = Array.from(document.querySelectorAll("a"));
    let links = elements.map((element) => {
      return element.href;
    });
    return links;

    // let tags = document.querySelectorAll('a');
    // return tags;
  });

  // find comments url
  let comment_links = await page.evaluate(() => {
    function getAllComments(node) {
      const xPath = "//comment()",
        result = [];

      let query = document.evaluate(
        xPath,
        node,
        null,
        XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      for (let i = 0, length = query.snapshotLength; i < length; ++i) {
        result.push(query.snapshotItem(i));
      }

      return result;
    }

    let links = [];
    let urlRegex = `((https?|ftp|file):)?//[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]`;
    let comments = getAllComments(document.documentElement);
    for (var i = 0; i < comments.length; i++) {
      var re = new RegExp(urlRegex);
      let url = comments[i].textContent.match(re);
      if (url != null && url.length > 0) {
        links = links.concat(url);
      }
      // if (re.test(comments[i].textContent) == true){
      //     links.push(comments[i].nodeValue);
      // }
    }

    return links;
  });

  // 遍历节点
  let xxx_links = await page.evaluate(() => {
    function getElements(root) {
      var treeWalker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: function acceptNode(node) {
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );
      // skip the first node which is the node specified in the `root`
      var currentNode = treeWalker.nextNode();
      var nodeList = [];
      while (currentNode) {
        nodeList.push(currentNode);
        currentNode = treeWalker.nextNode();
      }
      return nodeList;
    }

    let links = [];
    let urlRegex = `((https?|ftp|file):)?//[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]`;
    let elements = getElements(document.documentElement);

    elements.forEach((element) => {
      switch (element.tagName) {
        case "HEAD":
          break;
        case "BODY":
          break;
        case "SCRIPT":
          // javascript
          element.textContent.match(urlRegex)?.forEach((url) => {
            links.push(url);
          });
          break;
        case "STYLE":
          // css
          element.textContent.match(urlRegex)?.forEach((url) => {
            links.push(url);
          });
          break;
        case "IFRAME":
          break;
        case "FRAME":
          break;
        case "FRAMESET":
          break;
        case "NOFRAMES":
          break;
        case "NOSCRIPT":
          break;
        case "META":
          break;
        case "LINK":
          break;
        case "TITLE":
          break;
        case "BASE":
          break;
        default:
          break;
      }
    });

    return links;
  });

  // filter out the links that are not in the target scope
  // filter duplicated links
  for (var i = 0; i < a_tag_links.length; i++) {
    let tag = a_tag_links[i];
    console.log("cluster url: ", tag);
    if (!tag.trim()) {
      continue;
    }
    await cluster.queue(tag);
  }

  for (var i = 0; i < comment_links.length; i++) {
    let tag = comment_links[i];
    console.log("cluster url: ", tag);
    if (!tag.trim()) {
      continue;
    }
    await cluster.queue(tag);
  }

  for (var i = 0; i < xxx_links.length; i++) {
    let tag = xxx_links[i];
    console.log("cluster url: ", tag);
    if (!tag.trim()) {
      continue;
    }
    await cluster.queue(tag);
  }

  // await cluster.queue('http://121.196.32.153:8080/WebGoat/start.mvc#lesson/SqlInjection.lesson/10');
  await cluster.idle();
  await cluster.close();

  await browser.close();
})();
